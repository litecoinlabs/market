const fs = require("fs");
const path = require("path");
const prettier = require("prettier");

// Directories
const srcDir = "../src-html";
const buildDir = "../gh-pages";

const fileNameMap = {
  "collection.html": "Collection",
  "collections.html": "Collections",
  "credits.html": "Credits",
  "index.html": "Home",
  "inscription.html": "Inscription",
  "listings.html": "Listings",
};

const varMap = {
  TITLE: " - OrdinalsLite.Market - Litecoin Ordinals Decentralized Exchange",
  SHORTDESC: "OrdinalsLite.Market is a Trustless Litecoin NFT Marketplace",
  LONGDESC:
    "OrdinalsLite.Market is an open-source, trustless marketplace for Litecoin NFTs/ordinals/inscriptions",
};

// Function to return dynamic text based on a variable name and filename
function getDynamicText(varName, filename) {
  switch (varName) {
    case "TITLE":
      return fileNameMap[filename] + varMap["TITLE"];
    default:
      return varMap[varName];
  }
}

// Read all files in the source directory
fs.readdir(srcDir, async (err, files) => {
  if (err) throw err;

  // Filter HTML files and ignore those starting with '_'
  const htmlFiles = files.filter(
    (file) =>
      path.extname(file) === ".html" && !path.basename(file).startsWith("_")
  );

  htmlFiles.forEach((file) => {
    const srcFilePath = path.join(srcDir, file);
    const buildFilePath = path.join(buildDir, file);

    fs.readFile(srcFilePath, "utf-8", async (err, data) => {
      if (err) throw err;

      // Regular expression to match the comments like '<!-- {{ _filename.html }} -->'
      const regex = /<!-- {{ (.*?) }} -->/g;

      let match;
      let content = data;

      // Replace each matched comment with the contents of the corresponding file
      while ((match = regex.exec(data)) !== null) {
        const includeFile = match[1];

        // Read the content of the file to be included
        const includeContent = fs.readFileSync(
          path.join(srcDir, includeFile),
          "utf-8"
        );

        // Replace the matched comment with the file content
        content = content.replace(match[0], includeContent);
      }

      // Replace dynamic variables like '%VARIABLE%'
      const dynamicVarRegex = /%(\w+)%/g;
      content = content.replace(dynamicVarRegex, (match, varName) =>
        getDynamicText(varName, file)
      );

      // Format the content with Prettier
      const formattedContent = await prettier.format(content, {
        parser: "html",
      });

      // Write the new content to the file in the build directory
      fs.writeFile(buildFilePath, formattedContent, "utf-8", (err) => {
        if (err) throw err;
      });
    });
  });
});
