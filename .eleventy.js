const fs = require("fs");
const path = require("path");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("src/admin");
  eleventyConfig.addPassthroughCopy("CNAME");

  eleventyConfig.addWatchTarget("src/assets/");

  eleventyConfig.addFilter("currency", (amount, code) => {
    const value = (amount || 0) / 100;
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code || "USD",
        maximumFractionDigits: 0,
      }).format(value);
    } catch (_) {
      return `$${value.toFixed(0)}`;
    }
  });

  eleventyConfig.addFilter("photoList", (slug) => {
    const dir = path.join(__dirname, "src", "assets", "apartments", slug);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f))
      .sort()
      .map((f) => `/assets/apartments/${slug}/${f}`);
  });

  eleventyConfig.addShortcode("t", function (key) {
    const lang = this.page?.lang || this.ctx?.lang || "en";
    const data = this.ctx?.i18n?.[lang] || {};
    const value = key.split(".").reduce((acc, part) => (acc && acc[part] != null ? acc[part] : null), data);
    return value != null ? value : key;
  });

  eleventyConfig.addFilter("year", function (date) {
    const d = date instanceof Date ? date : new Date();
    return d.getFullYear();
  });

  eleventyConfig.addFilter("tpath", function (langDict, path) {
    if (!langDict || !path) return path;
    const value = String(path)
      .split(".")
      .reduce((acc, part) => (acc && acc[part] != null ? acc[part] : null), langDict);
    return value != null ? value : path;
  });

  eleventyConfig.addShortcode("tx", function (key, vars) {
    const lang = this.page?.lang || this.ctx?.lang || "en";
    const data = this.ctx?.i18n?.[lang] || {};
    let value = key.split(".").reduce((acc, part) => (acc && acc[part] != null ? acc[part] : null), data);
    if (value == null) return key;
    if (vars && typeof value === "string") {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return value;
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    templateFormats: ["njk", "html", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
