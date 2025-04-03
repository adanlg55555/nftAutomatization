document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropArea = document.getElementById('drop-area');
    const fileUpload = document.getElementById('file-upload');
    const browseButton = document.querySelector('.browse');
    const previewArea = document.getElementById('preview-area');
    const imagePreview = document.getElementById('image-preview');
    const fileName = document.getElementById('file-name');
    const removeFileBtn = document.getElementById('remove-file');
    const mintBtn = document.getElementById('mint-btn');
    const statusContainer = document.getElementById('status-container');
    const resultContainer = document.getElementById('result-container');
    const openseaLink = document.getElementById('opensea-link');
    const mintAnotherBtn = document.getElementById('mint-another');
    const errorModal = document.getElementById('error-modal');
    const errorMessage = document.getElementById('error-message');
    const closeErrorBtn = document.getElementById('close-error');
    
    // Status Steps
    const uploadStep = document.getElementById('step-upload');
    const mintStep = document.getElementById('step-mint');
    const completeStep = document.getElementById('step-complete');
    
    let selectedFile = null;

    // Event Listeners
    dropArea.addEventListener('click', () => fileUpload.click());
    browseButton.addEventListener('click', (e) => {
        e.stopPropagation();
        fileUpload.click();
    });

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('active');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('active');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('active');
        handleFiles(e.dataTransfer.files);
    });

    fileUpload.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    removeFileBtn.addEventListener('click', () => {
        resetFileSelection();
    });

    mintBtn.addEventListener('click', () => {
        if (selectedFile) {
            startMinting();
        }
    });

    mintAnotherBtn.addEventListener('click', () => {
        resetUI();
    });

    closeErrorBtn.addEventListener('click', () => {
        errorModal.classList.add('hidden');
    });

    // Functions
    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            
            // Validate file type
            if (!file.type.startsWith('image/')) {
                showError('Please select an image file (JPG, PNG, etc.)');
                return;
            }
            
            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showError('File size must be less than 5MB');
                return;
            }
            
            selectedFile = file;
            
            // Preview the image
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                fileName.textContent = file.name;
                previewArea.classList.remove('hidden');
                dropArea.classList.add('hidden');
                mintBtn.classList.remove('disabled');
                mintBtn.disabled = false;
            };
            reader.readAsDataURL(file);
        }
    }

    function resetFileSelection() {
        selectedFile = null;
        fileUpload.value = '';
        previewArea.classList.add('hidden');
        dropArea.classList.remove('hidden');
        mintBtn.classList.add('disabled');
        mintBtn.disabled = true;
    }

    function resetUI() {
        resetFileSelection();
        statusContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        
        // Reset status steps
        resetStatusSteps();
    }

    function resetStatusSteps() {
        const steps = [uploadStep, mintStep, completeStep];
        steps.forEach(step => {
            const icon = step.querySelector('.step-icon');
            icon.className = 'step-icon pending';
        });
    }

    function updateStepStatus(step, status) {
        const icon = step.querySelector('.step-icon');
        icon.className = `step-icon ${status}`;
        
        if (status === 'complete') {
            icon.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L9 17L4 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
        } else {
            icon.innerHTML = '';
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorModal.classList.remove('hidden');
    }

    async function getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (error) => {
                    reject(error);
                }
            );
        });
    }

    async function getImageMetadata(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    width: img.width,
                    height: img.height,
                    aspectRatio: (img.width / img.height).toFixed(2),
                    size: (file.size / 1024).toFixed(2) + ' KB',
                    type: file.type
                });
            };
            img.src = URL.createObjectURL(file);
        });
    }

    async function startMinting() {
        console.log('Starting minting process');
        statusContainer.classList.remove('hidden');
        resetStatusSteps();
        
        try {
            // Get location and image metadata
            const [location, imageMetadata] = await Promise.all([
                getCurrentLocation(),
                getImageMetadata(selectedFile)
            ]);
            
            console.log('Location obtained:', location);
            console.log('Image metadata:', imageMetadata);

            // Step 1: Upload to IPFS
            console.log('Step 1: Uploading to IPFS');
            updateStepStatus(uploadStep, 'active');
            const formData = new FormData();
            formData.append('image', selectedFile);
            formData.append('latitude', location.latitude);
            formData.append('longitude', location.longitude);
            formData.append('imageMetadata', JSON.stringify(imageMetadata));
            
            console.log('Sending upload request');
            const uploadResponse = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            console.log('Upload response status:', uploadResponse.status);
            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                console.error('Upload failed:', errorData);
                throw new Error(errorData.message || 'Failed to upload image to IPFS');
            }
            
            const uploadData = await uploadResponse.json();
            console.log('Upload successful:', uploadData);
            updateStepStatus(uploadStep, 'complete');
            
            // Step 2: Mint NFT - Backend handles all blockchain interaction
            console.log('Step 2: Minting NFT');
            updateStepStatus(mintStep, 'active');
            const mintResponse = await fetch('/api/mint', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ipfsHash: uploadData.ipfsHash
                })
            });
            
            console.log('Mint response status:', mintResponse.status);
            if (!mintResponse.ok) {
                const errorData = await mintResponse.json();
                console.error('Minting failed:', errorData);
                throw new Error(errorData.message || 'Failed to mint NFT');
            }
            
            const mintData = await mintResponse.json();
            console.log('Minting successful:', mintData);
            updateStepStatus(mintStep, 'complete');
            
            // Step 3: Complete
            console.log('Step 3: Completing process');
            updateStepStatus(completeStep, 'complete');
            
            // Show result
            openseaLink.href = mintData.openseaUrl;
            resultContainer.classList.remove('hidden');
            console.log('Minting process completed successfully');
            
        } catch (error) {
            console.error('Minting error:', error);
            showError(error.message || 'An error occurred during the minting process');
            resetStatusSteps();
        }
    }

    // Add this debug function to script.js
    function debugLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log('Your location:', {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    });
                },
                (error) => {
                    console.error('Error getting location:', error.message);
                }
            );
        } else {
            console.error('Geolocation is not supported by this browser');
        }
    }

    // Add this line after your existing event listeners
    document.addEventListener('DOMContentLoaded', debugLocation);
});

