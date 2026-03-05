const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
const cache = new NodeCache({ stdTTL: 30 }); // Cache 30 giây

app.use(cors());
app.use(express.json());

// Middleware kiểm tra API key (tùy chọn)
const API_KEYS = ['your_secret_key_1', 'your_secret_key_2']; // Thay bằng key của bạn

const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !API_KEYS.includes(apiKey)) {
        return res.status(401).json({ error: 'Invalid API Key' });
    }
    next();
};

// Endpoint chính - lấy danh sách server
app.get('/api/servers/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params;
        const { limit = 100, minPlayers = 0, excludeFull = true } = req.query;
        
        // Kiểm tra cache
        const cacheKey = `servers_${placeId}_${limit}_${minPlayers}_${excludeFull}`;
        const cachedData = cache.get(cacheKey);
        
        if (cachedData) {
            return res.json({
                success: true,
                cached: true,
                data: cachedData
            });
        }
        
        // Gọi API Roblox
        const response = await axios.get(
            `https://games.roblox.com/v1/games/${placeId}/servers/Public`,
            {
                params: { limit: Math.min(limit, 100) },
                timeout: 5000
            }
        );
        
        let servers = response.data.data;
        
        // Lọc server theo yêu cầu
        if (excludeFull) {
            servers = servers.filter(s => s.playing < s.maxPlayers);
        }
        
        if (minPlayers > 0) {
            servers = servers.filter(s => s.playing >= minPlayers);
        }
        
        // Lưu vào cache
        cache.set(cacheKey, servers);
        
        res.json({
            success: true,
            cached: false,
            total: servers.length,
            data: servers
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint lấy random server
app.get('/api/random/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params;
        const { minPlayers = 0 } = req.query;
        
        // Gọi endpoint servers để lấy danh sách
        const response = await axios.get(
            `http://localhost:${PORT}/api/servers/${placeId}`,
            { params: { minPlayers, limit: 100 } }
        );
        
        if (!response.data.success || response.data.data.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No servers found'
            });
        }
        
        const servers = response.data.data;
        const randomServer = servers[Math.floor(Math.random() * servers.length)];
        
        res.json({
            success: true,
            data: {
                jobId: randomServer.id,
                playing: randomServer.playing,
                maxPlayers: randomServer.maxPlayers,
                ping: randomServer.ping
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint kiểm tra health
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        cacheStats: cache.getStats()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API Server running on port ${PORT}`);
});
