import fs from "fs";
import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;600;800&family=Inter:wght@400;500;600&display=swap');
  
  :root {
    --primary: #0ea5e9; --dark: #0f172a; --light: #f8fafc; --gray: #64748b; --border: #e2e8f0;
  }
  
  * { box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #fff; color: var(--dark); margin: 0; padding: 0; }
  
  .page {
    width: 794px; min-height: 1122px; margin: 0 auto; padding: 50px 60px;
    position: relative; background: white;
    page-break-after: always;
  }
  
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid var(--border); padding-bottom: 15px; margin-bottom: 25px; }
  .header-left { display: flex; flex-direction: column; }
  .header .logo-sm { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 22px; font-weight: 800; color: var(--primary); margin:0;}
  .header .os-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800; color: var(--dark); margin-top: 4px; display:flex; align-items:center; gap:8px;}
  .header .lang { background: #bae6fd; color: #0369a1; padding: 4px 10px; border-radius: 12px; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
  
  .intro { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 30px; font-weight: 500; }
  
  .step { display: flex; gap: 15px; margin-bottom: 25px; }
  .step-num { flex-shrink: 0; width: 32px; height: 32px; background: var(--primary); color: white; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 16px; font-weight: 800; }
  .step-content { flex: 1; }
  .step-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 800; color: var(--dark); margin: 0 0 10px 0; line-height: 1.3;}
  
  .instruction-list { margin: 0; padding-left: 0; list-style: none; }
  .instruction-list li { position: relative; padding-left: 18px; font-size: 13px; color: #334155; line-height: 1.5; margin-bottom: 8px; }
  .instruction-list li::before { content: '→'; position: absolute; left: 0; font-weight: 800; color: var(--primary); }
  
  .warning { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 10px 0 10px 0; border-radius: 0 8px 8px 0; }
  .warning-title { font-size: 13px; font-weight: 800; color: #b91c1c; margin: 0 0 6px 0; display: flex; align-items: center; gap: 5px; }
  .warning p { margin: 0 0 6px 0; font-size: 12.5px; color: #7f1d1d; line-height: 1.4; padding-left: 8px; border-left: 2px solid #fca5a5;}
                
  .highlight { display: inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 5px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 11.5px; font-weight: 600; color: #0f172a; }
  
  .footer { position: absolute; bottom: 30px; left: 60px; right: 60px; border-top: 1px solid var(--border); padding-top: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; font-weight: 500; }
`;

function formatLine(line) {
  let f = line.replace(/\*([^*]+)\*/g, '<b>$1</b>');
  f = f.replace(/\`([^\`]+)\`/g, '<span class="highlight">$1</span>');
  return f;
}

function parseNotice(txtFile, osName, osIcon) {
  if (!fs.existsSync(txtFile)) {
    return [];
  }
  const content = fs.readFileSync(txtFile, 'utf-8');
  const chunks = content.split('======================================================');
  const langs = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const langName = chunks[i].trim();
    const langBody = chunks[i+1].trim();
    const stepMatch = langBody.split(/(^\d+\.\s.*$)/m);
    const intro = formatLine(stepMatch[0].trim());
    const steps = [];
    for (let j = 1; j < stepMatch.length; j += 2) {
      const stepHeader = stepMatch[j].trim();
      const stepContent = stepMatch[j+1].trim();
      const numMatch = stepHeader.match(/^(\d+)\.\s+(.*)$/);
      if(!numMatch) continue;
      const num = numMatch[1];
      let title = numMatch[2];
      title = formatLine(title);
      const lines = stepContent.split('\n').map(l => l.trim()).filter(l => l);
      steps.push({ num, title, lines });
    }
    langs.push({ langName, intro, steps, osName, osIcon });
  }
  return langs;
}

const allData = [
  ...parseNotice(path.join(__dirname, 'NOTICE_INSTALLATION_WINDOWS.txt'), 'Windows', '🟦'),
  ...parseNotice(path.join(__dirname, 'NOTICE_INSTALLATION_MACOS.txt'), 'macOS', '🍏'),
  ...parseNotice(path.join(__dirname, 'NOTICE_INSTALLATION_LINUX.txt'), 'Linux', '🐧')
];

let htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>CLAUS.IO Installation Guides</title><style>${css}</style></head><body>`;

// Cover
htmlContent += `
  <div class="page">
    <h1 style="font-size: 60px;">CLAUS.IO</h1>
    <div style="font-size: 20px;">Installation Guides</div>
  </div>`;

// Content
allData.forEach(lang => {
  htmlContent += `
  <div class="page">
    <div class="header">
       <div class="header-left">
         <h1 class="logo-sm">CLAUS.IO</h1>
         <div class="os-title">${lang.osIcon} ${lang.osName} Installation</div>
       </div>
       <div class="lang">${lang.langName}</div>
    </div>
    <div class="intro">${lang.intro}</div>
    <div class="steps">`;

  lang.steps.forEach(step => {
    htmlContent += `
    <div class="step">
      <div class="step-num">${step.num}</div>
      <div class="step-content">
        <h3 class="step-title">${step.title}</h3>`;
    let inWarning = false;
    let currentList = [];
    function flushList() {
      if (currentList.length > 0) {
        htmlContent += `<ul class="instruction-list">`;
        currentList.forEach(cl => { htmlContent += `<li>${formatLine(cl)}</li>`; });
        htmlContent += `</ul>`;
        currentList = [];
      }
    }

    step.lines.forEach(line => {
      if (line.includes('⚠️')) {
        flushList();
        if (!inWarning) {
          htmlContent += `<div class="warning"><div class="warning-title">${formatLine(line)}</div>`;
          inWarning = true;
        } else {
          htmlContent += `<p>${formatLine(line.replace(/⚠️/g, ''))}</p>`;
        }
      } else if (line.startsWith('->') || line.startsWith('a.') || line.startsWith('b.') || line.startsWith('c.') || line.startsWith('d.') || line.startsWith('(Astuce') || line.startsWith('(Terminal') || line.startsWith('(Alternative')) {
        if (inWarning) htmlContent += `<p>${formatLine(line.replace('->', '↳'))}</p>`;
        else currentList.push(line.replace('->', '↳'));
      } else if (line.startsWith('-')) {
         if (inWarning) { htmlContent += `</div>`; inWarning = false; }
        currentList.push(line.replace(/^- /, ''));
      } else {
         if (inWarning) htmlContent += `<p>${formatLine(line)}</p>`;
         else currentList.push(line);
      }
    });

    if (inWarning) htmlContent += `</div>`;
    flushList();
    htmlContent += `</div></div>`;
  });

  htmlContent += `
    </div>
    <div class="footer">
      <span>CLAUS.IO - ${lang.osName}</span>
      <span>${lang.langName}</span>
    </div>
  </div>`;
});

htmlContent += "</body></html>";
fs.writeFileSync("Final_Install_Guide.html", htmlContent);

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const html = fs.readFileSync("Final_Install_Guide.html", "utf-8");
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ 
      path: "CLAUS_IO_Installation_Guides.pdf", 
      format: "A4", printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });
    fs.copyFileSync("CLAUS_IO_Installation_Guides.pdf", "public/CLAUS_IO_Installation_Guides.pdf");
    await browser.close();
    console.log("Installation PDF Generated!");
})();
