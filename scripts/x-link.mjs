const title = process.argv.slice(2).join(" ").trim();

if (!title) {
  console.error('Usage: yarn x:link "post name"');
  process.exitCode = 1;
} else {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    console.error("Post name must contain at least one letter or number.");
    process.exitCode = 1;
  } else {
    console.log(`https://nitrowind.dev/x/${slug}`);
  }
}
