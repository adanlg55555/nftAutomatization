require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// NFT Contract ABI (minimal interface for mintNFT function)
const contractABI = [
    "function mintNFT(address recipient, string memory tokenURI) external returns (uint256)"
];

// Initialize blockchain connection and wallet
const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    contractABI,
    wallet
);

console.log('Backend wallet initialized:', wallet.address);

// API Routes
app.post('/api/upload', upload.single('image'), async (req, res) => {
    console.log('Received upload request');
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image file provided' });
        }

        // Get location data
        const latitude = req.body.latitude;
        const longitude = req.body.longitude;

        // Example location check (modify coordinates for your desired area)
        const allowedArea = {
            // Coordinates for central Spain region
            minLat: 48.0,    // Southern bound
            maxLat: 50.0,    // Northern bound
            minLng: -4.5,    // Western bound
            maxLng: -3.0     // Eastern bound
        };

        if (!isLocationValid(latitude, longitude, allowedArea)) {
            return res.status(403).json({
                success: false,
                message: 'Minting is not allowed in your current location'
            });
        }

        console.log('Processing file:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });

        // Create form data for Pinata API
        const formData = new FormData();
        formData.append('file', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });

        console.log('Uploading to Pinata...');
        const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
            maxBodyLength: Infinity,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
                'Authorization': `Bearer ${process.env.PINATA_JWT_TOKEN}`
            }
        });

        const ipfsHash = response.data.IpfsHash;
        console.log('File uploaded to IPFS:', ipfsHash);

        // Add location to metadata
        const metadata = {
            name: `NFT ${Date.now()}`,
            description: 'Minted through NFT Minter App',
            image: `ipfs://${ipfsHash}`,
            attributes: [
                {
                    trait_type: "Latitude",
                    value: latitude
                },
                {
                    trait_type: "Longitude",
                    value: longitude
                }
            ]
        };

        const metadataResponse = await axios.post(
            'https://api.pinata.cloud/pinning/pinJSONToIPFS',
            metadata,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.PINATA_JWT_TOKEN}`
                }
            }
        );

        return res.status(200).json({
            success: true,
            ipfsHash: `ipfs://${metadataResponse.data.IpfsHash}`,
            imageUrl: `https://gateway.pinata.cloud/ipfs/${ipfsHash}`,
            metadataUrl: `https://gateway.pinata.cloud/ipfs/${metadataResponse.data.IpfsHash}`
        });

    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload image to IPFS'
        });
    }
});

function isLocationValid(lat, lng, allowedArea) {
    const isValid = (
        lat >= allowedArea.minLat &&
        lat <= allowedArea.maxLat &&
        lng >= allowedArea.minLng &&
        lng <= allowedArea.maxLng
    );
    
    console.log('Location check:', {
        provided: { lat, lng },
        allowed: allowedArea,
        isValid: isValid
    });
    
    return isValid;
}

app.post('/api/mint', async (req, res) => {
    console.log('Received mint request');
    try {
        const { ipfsHash } = req.body;
        
        if (!ipfsHash) {
            return res.status(400).json({ success: false, message: 'IPFS hash is required' });
        }

        console.log('Minting NFT with metadata:', ipfsHash);
        
        // Get the current gas price
        const gasPrice = await provider.getFeeData();
        
        // Mint the NFT using the backend wallet
        const tx = await contract.mintNFT(
            wallet.address,
            ipfsHash,
            {
                gasPrice: gasPrice.gasPrice,
                gasLimit: 500000
            }
        );

        console.log('Waiting for transaction confirmation...');
        const receipt = await tx.wait();
        console.log('Transaction confirmed:', receipt.hash);

        // Get the token ID from the transaction response
        const mintEvent = receipt.logs[0];  // The first event should be the Transfer event
        const tokenId = parseInt(mintEvent.topics[3], 16);  // The token ID is in the third topic
        console.log('Minted token ID:', tokenId);

        const openseaUrl = `https://testnets.opensea.io/assets/sepolia/${process.env.CONTRACT_ADDRESS}/${tokenId}`;

        return res.status(200).json({
            success: true,
            transactionHash: receipt.hash,
            tokenId: tokenId.toString(),
            openseaUrl
        });

    } catch (error) {
        console.error('Minting error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to mint NFT'
        });
    }
});

// Add this route to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

