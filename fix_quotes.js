const fs = require('fs');
const jsPath = require('path').join(__dirname, 'public/dashboard.js');

let content = fs.readFileSync(jsPath, 'utf8');

// The replacement script incorrectly escaped single quotes inside the template literal strings, like \\'email\\'
// This regex specifically targets that escaping mistake
content = content.replace(/\\\\'([a-zA-Z-]+)\\\\'/g, "'$1'"); 
// Wait, the string is literally "\'email\'"? Let's just strip every "\\'"
content = content.split("\\\\'").join("'");

fs.writeFileSync(jsPath, content);
console.log('Fixed quotes in dashboard.js');
