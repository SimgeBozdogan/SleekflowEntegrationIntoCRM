const axios = require("axios");
const API_KEY = "1s4Npe771yHJHv0ho5thauUHCCAQ38kChRdHCXilw5Y";
console.log("ğŸ” Testing Sleekflow API...");
axios.get("https://api.sleekflow.io/api/contact", {
    params: { limit: 1 },
    headers: { "X-Sleekflow-Api-Key": API_KEY, "Content-Type": "application/json" },
    timeout: 10000
}).then(r => {
    console.log("âœ… SUCCESS! Status:", r.status);
    process.exit(0);
}).catch(e => {
    console.log("âŒ FAILED! Status:", e.response?.status || "N/A");
    console.log("Error:", e.message);
    if(e.response?.data) console.log("Response:", JSON.stringify(e.response.data));
    process.exit(1);
});
