const fs = require('fs');
let code = fs.readFileSync('src/pages/admin/AdminProducts.tsx', 'utf8');

// Identify the end of the component
const componentEndRegex = /\s*<\/form>\s*<\/div>\s*<\/div>\s*\}\)\}\s*<\/div>\s*\);\s*\}/;
const match = code.match(componentEndRegex);

if (!match) {
    console.log("Could not find component end!");
    process.exit(1);
}

const componentEndIdx = match.index;
const floatingCode = code.substring(componentEndIdx + match[0].length);

// Inside the floating code, we have:
// <div className="md:col-span-2 border-t border-gray-100 pt-6 mt-6">
//                 <h3 className="font-bold text-[#132333] mb-4 text-lg">Způsob výpočtu ceny</h3>undefined</div>{/* END DIMS TAB */}
// 
// <div className={activeTab === 'params' ? 'space-y-6 block' : 'hidden'}>
// ... params content ...
// undefined</div>{/* END PARAMS TAB */}
//
// <div className={activeTab === 'gallery' ? 'space-y-6 block' : 'hidden'}>
// ... gallery content ...
// </div>{/* END GALLERY TAB */}
//
// <div className="md:col-span-2 flex justify-end gap-3 mt-6 pt-6 border-t border-gray-100">undefined

// Let's just fix it by replacing the floating code and putting everything back in the form!
// Wait! The "Způsob výpočtu ceny" part in the floating code has "undefined" instead of the actual content of dims tab!
// Where is the actual content? It's currently INSIDE the component, between lines 1032 and 1085!
// And where is the actual params content? Between 1088 and 1432!
// The script I wrote earlier literally just replaced the div wrappers but DID NOT move the content! It just replaced the wrappers with `undefined`!
console.log("Wait, the floating code only contains the WRAPPERS and 'undefined' where the content was supposed to be?");

// Let's verify this!
fs.writeFileSync('floating.txt', floatingCode);
console.log("Floating code written to floating.txt");
