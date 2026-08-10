const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'dist', 'web-app', 'browser', 'index.html');

try {
  let html = fs.readFileSync(indexPath, 'utf8');
  
  // Replace media="print" onload="this.media='all'" with normal loading
  html = html.replace(
    /<link rel="stylesheet" href="(styles-[A-Z0-9]+\.css)" media="print" onload="this\.media='all'">/g,
    '<link rel="stylesheet" href="$1">'
  );
  
  // Remove the noscript fallback (no longer needed)
  html = html.replace(
    /<noscript><link rel="stylesheet" href="styles-[A-Z0-9]+\.css"><\/noscript>/g,
    ''
  );
  
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('✓ Fixed CSS loading in index.html');
} catch (error) {
  console.error('Error fixing CSS loading:', error.message);
  process.exit(1);
}
