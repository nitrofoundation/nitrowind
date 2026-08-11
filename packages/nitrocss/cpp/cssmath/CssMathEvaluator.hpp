#pragma once

#include <map>
#include <memory>
#include <optional>
#include <string>
#include <variant>
#include <vector>

namespace nitrocss::cssmath {

class DescriptorValue {
 public:
  using Object = std::map<std::string, DescriptorValue>;
  using Array = std::vector<DescriptorValue>;
  using Storage =
      std::variant<std::monostate, double, std::string, Object, Array>;

  DescriptorValue() = default;
  DescriptorValue(double value) : storage_(value) {}
  DescriptorValue(const char* value) : storage_(std::string(value)) {}
  DescriptorValue(std::string value) : storage_(std::move(value)) {}
  DescriptorValue(Object value) : storage_(std::move(value)) {}
  DescriptorValue(Array value) : storage_(std::move(value)) {}

  const Storage& storage() const { return storage_; }
  const Object* object() const { return std::get_if<Object>(&storage_); }
  const Array* array() const { return std::get_if<Array>(&storage_); }
  const std::string* string() const {
    return std::get_if<std::string>(&storage_);
  }
  const double* number() const { return std::get_if<double>(&storage_); }

 private:
  Storage storage_;
};

enum class Unit {
  Number,
  Px,
  Percent,
  Rem,
  Em,
  Vw,
  Vh,
  Vmin,
  Vmax,
  Cqw,
  Cqh,
  Cqi,
  Cqb,
};

enum class NodeType { Value, Variable, Negate, Operation, Function };

struct Node;
using NodePtr = std::shared_ptr<const Node>;

struct Node {
  NodeType type{NodeType::Value};
  double value{0.0};
  Unit unit{Unit::Number};
  std::string name;
  char operation{'+'};
  NodePtr fallback;
  NodePtr left;
  NodePtr right;
  std::vector<NodePtr> values;
};

struct Runtime {
  std::optional<double> viewportWidth;
  std::optional<double> viewportHeight;
  std::optional<double> containerWidth;
  std::optional<double> containerHeight;
  std::optional<double> containerInlineSize;
  std::optional<double> containerBlockSize;
  std::optional<double> percentBase;
  double rem{16.0};
  double em{16.0};
  std::map<std::string, double> numericVariables;
  std::map<std::string, NodePtr> expressionVariables;
};

struct DecodeResult {
  NodePtr node;
  std::string error;
  explicit operator bool() const { return node != nullptr; }
};

/** Decode the JSON-compatible descriptor emitted by parsers/cssMath.ts. */
DecodeResult decodeDescriptor(const DescriptorValue& descriptor);

/** Resolve a decoded expression. Missing measurements and invalid math return nullopt. */
std::optional<double> evaluate(const Node& node, const Runtime& runtime);

}  // namespace nitrocss::cssmath
