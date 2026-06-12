import { PDFParse } from "pdf-parse";
import fs from "fs";

async function test() {
  try {
    const data = fs.readFileSync("public/CLAUS_IO_Executive_Guide.pdf");
    const parser = new PDFParse({ data });
    const result = await parser.getText();
    console.log("Pages:", result.pages.length);
    console.log("Total text length:", result.text.length);
  } catch (e) {
    console.error(e.message);
  }
}
test();
