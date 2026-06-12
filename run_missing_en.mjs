import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf-8');

const tRegex = /t\.([a-zA-Z0-9_]+)\s*\|\|\s*["']([^"']+)["']/g;

let match;
const hardcodedDict = {};
while ((match = tRegex.exec(content)) !== null) {
  hardcodedDict[match[1]] = match[2];
}

const extractKeys = (startMarker, endMarker) => {
    let inBlock = false;
    const keys = [];
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.includes(startMarker)) {
            inBlock = true;
            continue;
        }
        if (inBlock && line.includes(endMarker)) {
            inBlock = false;
            break;
        }
        if (inBlock) {
            const match2 = line.match(/^\s+([a-zA-Z0-9_]+)\s*:/);
            if (match2) keys.push(match2[1]);
        }
    }
    return keys;
};

const enKeys = extractKeys('en: {', 'de: {');

const missing = Object.keys(hardcodedDict).filter(k => !enKeys.includes(k));
console.log("Missing hardcoded keys in EN:", missing.length);

const translations = {
    landingTitle: "Welcome",
    landingSubtitle: "System Initialization",
    accessKitchen: "Access Kitchen",
    productionPlan: "Production Plan",
    freeTrial: "Free Trial",
    trialDaysLeft: "You have {days} days left in your trial.",
    trialExpired: "Trial Expired",
    ollamaStatus: "AI Model Status",
    checking: "Checking...",
    testConnection: "Test connection",
    connectedStatus: "Connected",
    errorStatus: "Error",
    notTested: "Not tested",
    saveSettings: "Save changes",
    dailyLaborCost: "Daily Labor Cost",
    foodCost: "Food Cost",
    laborCost: "Labor Cost",
    recipeFT: "TECHNICAL SHEET",
    guests: "Guests",
    estimatedLoss: "Estimated loss",
    requiredIngredients: "Required ingredients:",
    aiAnalysisActive: "AI Analysis Active",
    traditionalCooking: "Bistro Chic Style",
    ftDedicatedTab: "Technical sheets are available in the dedicated tab.",
    generateAnother: "Generate another menu",
    lunch: "Lunch",
    dinner: "Dinner",
    gastronomicMenusGenerated: "Gastronomic Menus Generated",
    chefMenu: "CHEF'S MENU",
    traditionalMenusGenerated: "Bistro Chic Menus Generated",
    entree: "Starter",
    plat: "Main Course",
    dessert: "Dessert",
    importSuccess: "Import successful",
    importError: "Import error",
    csvReadError: "Error reading CSV",
    csvLoadError: "Error loading CSV",
    inventoryLoadError: "Error loading inventory",
    addSuccess: "Successfully added",
    addError: "Error while adding",
    serverConnError: "Server connection error",
    deleteSuccess: "Successfully deleted",
    deleteError: "Error while deleting",
    updateSuccess: "Successfully updated",
    updateError: "Update error",
    clausUnavailable: "CLAUS.IO seems unavailable",
    analyzing: "Analyzing...",
    exName: "e.g. Flour",
    stockDeductedSuccess: "Stock successfully deducted",
    stockDeductionError: "Error in stock deduction",
    prodPlanSubtitle: "Manage your guests and remove ingredients from inventory.",
    clear: "Clear",
    consumeStock: "REMOVE FROM INVENTORY",
    recipesToProduce: "Recipes to produce",
    ingredientsToConsumeList: "Ingredients list to remove",
    article: "ITEM",
    totalQuantity: "CUMULATIVE QUANTITY",
    forLabel: "For",
    unitsLabel: "units",
    piecesLabel: "pieces",
    noRecipesInPlan: "No recipes in the production plan.",
    antiWasteFT: "Anti-Waste Recipes",
    difficultyLabel: "Difficulty",
    mediumDifficulty: "Medium",
    estimatedSavings: "Estimated Savings",
    ingredientsQuantities: "Ingredients & Quantities",
    prepInstructions: "Preparation Instructions",
    printSheet: "Print Sheet",
    chatWelcome: "Hello! I am your culinary assistant. Ask me questions about cooking, recipes, or techniques!",
    totalShort: "TOTAL",
    quantityShort: "QTY",
    unitPriceShort: "UNIT PRICE",
    emptyArchive: "Archive is empty",
    emptyFolder: "Empty folder",
    noDocumentRegistered: "No document registered.",
    confirmDeleteRecipe: "Are you sure you want to delete this recipe?",
    recipeSaved: "Recipe saved",
    successAddToCartProduction: "✅ Added to Production Plan",
    gastronomy: "Gastronomy",
    traditionalCatering: "Bistro Chic",
    importedSheets: "Imported Sheets",
    addRecipeManually: "Add manually",
    recipeBook: "My Recipe Book",
    menuFolders: "Folders",
    sheetsCount: "{count} sheets",
    noFolderSelected: "Select a category to view sheets",
    selectCategoryDesc: "Click a folder on the left to explore the generated or imported menus and recipes.",
    emptyFolderDesc: "Generate menus to populate this category.",
    portionShort: "Ptn",
    technicalSheetFull: "Technical Sheet",
    qtyShort: "Qty",
    selectIngredient: "Select ingredient",
    notDef: "Not def.",
    dishName: "Dish Name",
    saveFull: "Save",
    prodPlanShort: "Plan",
    qtyPerPersShort: "Qty/Pers"
};

let outputStr = "    // Inserted hardcoded fallbacks\n";
for (const key of missing) {
    if (translations[key]) {
        outputStr += `    ${key}: "${translations[key]}",\n`;
    } else {
        // Fallback to original
        outputStr += `    ${key}: "${hardcodedDict[key].replace(/"/g, '\\"')}",\n`;
    }
}

fs.writeFileSync('/missing_en.ts', outputStr);
console.log("Wrote /missing_en.ts - copy and insert into src/App.tsx!");

