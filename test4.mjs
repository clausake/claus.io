import { PDFParse } from "pdf-parse";

async function test() {
  try {
    const parser = new PDFParse({ data: Buffer.from("dummy") });
    await parser.getText();
  } catch (e) {
    console.error(e.message);
  }
}
test();
