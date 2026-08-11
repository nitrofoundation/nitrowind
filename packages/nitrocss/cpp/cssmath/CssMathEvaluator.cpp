#include "CssMathEvaluator.hpp"

#include <algorithm>
#include <cmath>
#include <set>

namespace nitrocss::cssmath {
namespace {

const DescriptorValue* get(
    const DescriptorValue::Object& object,
    const std::string& key) {
  const auto iterator = object.find(key);
  return iterator == object.end() ? nullptr : &iterator->second;
}

std::optional<Unit> parseUnit(const std::string& unit) {
  static const std::map<std::string, Unit> units{
      {"number", Unit::Number}, {"px", Unit::Px},
      {"%", Unit::Percent},     {"rem", Unit::Rem},
      {"em", Unit::Em},        {"vw", Unit::Vw},
      {"vh", Unit::Vh},        {"vmin", Unit::Vmin},
      {"vmax", Unit::Vmax},    {"cqw", Unit::Cqw},
      {"cqh", Unit::Cqh},      {"cqi", Unit::Cqi},
      {"cqb", Unit::Cqb},
  };
  const auto iterator = units.find(unit);
  return iterator == units.end() ? std::nullopt
                                 : std::optional(iterator->second);
}

DecodeResult decodeNode(const DescriptorValue& value, int depth) {
  if (depth > 64) return {nullptr, "CSS math descriptor is too deeply nested"};
  const auto* object = value.object();
  if (object == nullptr) return {nullptr, "CSS math node must be an object"};
  const auto* typeValue = get(*object, "type");
  const auto* type = typeValue == nullptr ? nullptr : typeValue->string();
  if (type == nullptr) return {nullptr, "CSS math node is missing type"};

  auto node = std::make_shared<Node>();
  if (*type == "value") {
    const auto* numberValue = get(*object, "value");
    const auto* unitValue = get(*object, "unit");
    const auto* number = numberValue == nullptr ? nullptr : numberValue->number();
    const auto* unitName = unitValue == nullptr ? nullptr : unitValue->string();
    const auto unit = unitName == nullptr ? std::nullopt : parseUnit(*unitName);
    if (number == nullptr || !std::isfinite(*number) || !unit.has_value()) {
      return {nullptr, "Invalid CSS math value node"};
    }
    node->type = NodeType::Value;
    node->value = *number;
    node->unit = *unit;
    return {node, {}};
  }
  if (*type == "variable") {
    const auto* nameValue = get(*object, "name");
    const auto* name = nameValue == nullptr ? nullptr : nameValue->string();
    if (name == nullptr || !name->starts_with("--")) {
      return {nullptr, "Invalid CSS variable name"};
    }
    node->type = NodeType::Variable;
    node->name = *name;
    if (const auto* fallback = get(*object, "fallback")) {
      const auto decoded = decodeNode(*fallback, depth + 1);
      if (!decoded) return decoded;
      node->fallback = decoded.node;
    }
    return {node, {}};
  }
  if (*type == "negate") {
    const auto* child = get(*object, "value");
    if (child == nullptr) return {nullptr, "Negate node is missing value"};
    const auto decoded = decodeNode(*child, depth + 1);
    if (!decoded) return decoded;
    node->type = NodeType::Negate;
    node->left = decoded.node;
    return {node, {}};
  }
  if (*type == "operation") {
    const auto* operationValue = get(*object, "operator");
    const auto* operation =
        operationValue == nullptr ? nullptr : operationValue->string();
    const auto* left = get(*object, "left");
    const auto* right = get(*object, "right");
    if (operation == nullptr || operation->size() != 1 ||
        std::string("+-*/").find((*operation)[0]) == std::string::npos ||
        left == nullptr || right == nullptr) {
      return {nullptr, "Invalid CSS math operation"};
    }
    const auto decodedLeft = decodeNode(*left, depth + 1);
    if (!decodedLeft) return decodedLeft;
    const auto decodedRight = decodeNode(*right, depth + 1);
    if (!decodedRight) return decodedRight;
    node->type = NodeType::Operation;
    node->operation = (*operation)[0];
    node->left = decodedLeft.node;
    node->right = decodedRight.node;
    return {node, {}};
  }
  if (*type == "function") {
    const auto* nameValue = get(*object, "name");
    const auto* valuesValue = get(*object, "values");
    const auto* name = nameValue == nullptr ? nullptr : nameValue->string();
    const auto* values = valuesValue == nullptr ? nullptr : valuesValue->array();
    if (name == nullptr || values == nullptr || values->empty() ||
        (*name != "min" && *name != "max" && *name != "clamp") ||
        (*name == "clamp" && values->size() != 3)) {
      return {nullptr, "Invalid CSS math function"};
    }
    node->type = NodeType::Function;
    node->name = *name;
    for (const auto& child : *values) {
      const auto decoded = decodeNode(child, depth + 1);
      if (!decoded) return decoded;
      node->values.push_back(decoded.node);
    }
    return {node, {}};
  }
  return {nullptr, "Unsupported CSS math node type"};
}

std::optional<double> evaluateNode(
    const Node& node,
    const Runtime& runtime,
    std::set<std::string>& seen,
    int depth);

std::optional<double> resolveValue(const Node& node, const Runtime& runtime) {
  const auto scaled = [&](const std::optional<double>& base) -> std::optional<double> {
    return base.has_value() ? std::optional(node.value * *base / 100.0)
                            : std::nullopt;
  };
  switch (node.unit) {
    case Unit::Number:
    case Unit::Px:
      return node.value;
    case Unit::Percent:
      return scaled(runtime.percentBase);
    case Unit::Rem:
      return node.value * runtime.rem;
    case Unit::Em:
      return node.value * runtime.em;
    case Unit::Vw:
      return scaled(runtime.viewportWidth);
    case Unit::Vh:
      return scaled(runtime.viewportHeight);
    case Unit::Vmin:
      return runtime.viewportWidth && runtime.viewportHeight
          ? std::optional(
                node.value *
                std::min(*runtime.viewportWidth, *runtime.viewportHeight) /
                100.0)
          : std::nullopt;
    case Unit::Vmax:
      return runtime.viewportWidth && runtime.viewportHeight
          ? std::optional(
                node.value *
                std::max(*runtime.viewportWidth, *runtime.viewportHeight) /
                100.0)
          : std::nullopt;
    case Unit::Cqw:
      return scaled(runtime.containerWidth);
    case Unit::Cqh:
      return scaled(runtime.containerHeight);
    case Unit::Cqi:
      return scaled(runtime.containerInlineSize.has_value()
                        ? runtime.containerInlineSize
                        : runtime.containerWidth);
    case Unit::Cqb:
      return scaled(runtime.containerBlockSize.has_value()
                        ? runtime.containerBlockSize
                        : runtime.containerHeight);
  }
  return std::nullopt;
}

std::optional<double> evaluateNode(
    const Node& node,
    const Runtime& runtime,
    std::set<std::string>& seen,
    int depth) {
  if (depth > 64) return std::nullopt;
  if (node.type == NodeType::Value) return resolveValue(node, runtime);
  if (node.type == NodeType::Variable) {
    if (seen.contains(node.name)) {
      return node.fallback
          ? evaluateNode(*node.fallback, runtime, seen, depth + 1)
          : std::nullopt;
    }
    if (const auto numeric = runtime.numericVariables.find(node.name);
        numeric != runtime.numericVariables.end()) {
      return std::isfinite(numeric->second)
          ? std::optional(numeric->second)
          : std::nullopt;
    }
    if (const auto expression = runtime.expressionVariables.find(node.name);
        expression != runtime.expressionVariables.end()) {
      seen.insert(node.name);
      const auto result = evaluateNode(*expression->second, runtime, seen, depth + 1);
      seen.erase(node.name);
      return result;
    }
    return node.fallback
        ? evaluateNode(*node.fallback, runtime, seen, depth + 1)
        : std::nullopt;
  }
  if (node.type == NodeType::Negate) {
    const auto value = evaluateNode(*node.left, runtime, seen, depth + 1);
    return value ? std::optional(-*value) : std::nullopt;
  }
  if (node.type == NodeType::Operation) {
    const auto left = evaluateNode(*node.left, runtime, seen, depth + 1);
    const auto right = evaluateNode(*node.right, runtime, seen, depth + 1);
    if (!left || !right) return std::nullopt;
    double value = 0.0;
    if (node.operation == '+') value = *left + *right;
    if (node.operation == '-') value = *left - *right;
    if (node.operation == '*') value = *left * *right;
    if (node.operation == '/') {
      if (*right == 0.0) return std::nullopt;
      value = *left / *right;
    }
    return std::isfinite(value) ? std::optional(value) : std::nullopt;
  }
  std::vector<double> values;
  values.reserve(node.values.size());
  for (const auto& child : node.values) {
    const auto value = evaluateNode(*child, runtime, seen, depth + 1);
    if (!value) return std::nullopt;
    values.push_back(*value);
  }
  if (node.name == "min") {
    return *std::min_element(values.begin(), values.end());
  }
  if (node.name == "max") {
    return *std::max_element(values.begin(), values.end());
  }
  return std::max(values[0], std::min(values[1], values[2]));
}

}  // namespace

DecodeResult decodeDescriptor(const DescriptorValue& descriptor) {
  const auto* object = descriptor.object();
  if (object == nullptr) return {nullptr, "CSS math descriptor must be an object"};
  const auto* root = get(*object, "$cssMath");
  return root == nullptr ? DecodeResult{nullptr, "Missing $cssMath marker"}
                         : decodeNode(*root, 0);
}

std::optional<double> evaluate(const Node& node, const Runtime& runtime) {
  std::set<std::string> seen;
  return evaluateNode(node, runtime, seen, 0);
}

}  // namespace nitrocss::cssmath
