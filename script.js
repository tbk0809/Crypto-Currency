const API_KEY = 'CG-jq6F6GX1aHR1zZP2jiBisKMS';

async function searchCoin() {
    const searchInput = document.getElementById('searchInput').value.trim().toLowerCase();
    const resultArea = document.getElementById('resultArea');

    // Error Handling: Empty Input
    if (!searchInput) {
        resultArea.innerHTML = '<div class="error">Please enter a valid coin name or symbol.</div>';
        return;
    }

    resultArea.innerHTML = 'Searching...';

    try {
        // Step 1: Search for the coin to get its official CoinGecko ID
        const searchResponse = await fetch(`https://api.coingecko.com/api/v3/search?query=${searchInput}`, {
            headers: { 'x-cg-demo-api-key': API_KEY }
        });
        const searchData = await searchResponse.json();

        // Error Handling: Data not found
        if (!searchData.coins || searchData.coins.length === 0) {
            resultArea.innerHTML = '<div class="error">Data not found. Please try a different name or symbol.</div>';
            return;
        }

        // Get the closest match (first result)
        const coin = searchData.coins[0]; 

        // Step 2: Fetch the current price and 24h change for that specific coin ID
        const priceResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd&include_24hr_change=true`, {
            headers: { 'x-cg-demo-api-key': API_KEY }
        });
        const priceData = await priceResponse.json();

        // Format the results
        const currentPrice = priceData[coin.id].usd;
        const change24h = priceData[coin.id].usd_24h_change.toFixed(2);
        
        // Change text color based on positive/negative trends
        const changeColor = change24h >= 0 ? 'green' : 'red';

        // Display the data
        resultArea.innerHTML = `
            <div class="success">
                <h3><img src="${coin.thumb}" alt="logo" style="vertical-align: middle; width: 25px;"> ${coin.name} (${coin.symbol.toUpperCase()})</h3>
                <p><strong>Current Price:</strong> $${currentPrice.toLocaleString()}</p>
                <p><strong>24h Change:</strong> <span style="color: ${changeColor}; font-weight: bold;">${change24h}%</span></p>
            </div>
        `;

    } catch (error) {
        // Error Handling: Catch network issues so the system doesn't crash
        console.error("API Error:", error);
        resultArea.innerHTML = '<div class="error">An unexpected error occurred while fetching data. Please try again later.</div>';
    }
}