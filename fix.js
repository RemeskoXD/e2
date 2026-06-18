const fs = require('fs');
const file = 'src/pages/admin/AdminProducts.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-\[#CCAD8A\] transition-all"/g, 'className="w-full px-4 py-2.5 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] transition-all"');
content = content.replace(/className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-\[#CCAD8A\] focus:bg-white transition-all"/g, 'className="w-full pl-10 pr-4 py-2 bg-gray-50 text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#CCAD8A] focus:bg-white transition-all"');
content = content.replace(/className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"/g, 'className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg"');
fs.writeFileSync(file, content);
console.log('Fixed classes');
