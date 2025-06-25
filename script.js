// Replace with your OpenAI API key
const OPENAI_API_KEY = 'YOUR_API_KEY';

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/gif'];

// DOM Elements
const moleImage = document.getElementById('moleImage');
const preview = document.getElementById('preview');
const changesCheckboxes = document.querySelectorAll('input[name="changes"]');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsSection = document.getElementById('results');
const analysisContent = document.getElementById('analysisContent');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'YOUR_API_KEY') {
        showError('Please configure your OpenAI API key in the script.js file');
        analyzeBtn.disabled = true;
        return;
    }
    
    moleImage.addEventListener('change', handleImageUpload);
    analyzeBtn.addEventListener('click', handleAnalyze);
});

// Handle image upload
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!SUPPORTED_FORMATS.includes(file.type)) {
        showError('Please upload a valid image file (JPEG, PNG, or GIF)');
        return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        showError('File size is too large. Please upload an image smaller than 5MB');
        return;
    }

    // Show loading state
    preview.innerHTML = '<div class="loading">Loading preview...</div>';

    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        preview.innerHTML = `
            <img src="${e.target.result}" alt="Mole Preview">
            <button class="clear-preview" title="Clear image">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Add clear button event listener
        const clearBtn = preview.querySelector('.clear-preview');
        clearBtn.addEventListener('click', () => {
            moleImage.value = '';
            preview.innerHTML = '';
            analyzeBtn.disabled = true;
        });

        // Enable analyze button
        analyzeBtn.disabled = false;
    };
    reader.onerror = () => {
        showError('Failed to load image preview');
    };
    reader.readAsDataURL(file);
}

// Handle analyze button click
async function handleAnalyze() {
    if (analyzeBtn.disabled) return;

    try {
        // Get image data
        const imageElement = preview.querySelector('img');
        if (!imageElement) {
            throw new Error('No image selected');
        }

        const imageBase64 = imageElement.src;
        
        // Get selected changes
        const checkedChanges = Array.from(changesCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
        const userAnswer = checkedChanges.length > 0 
            ? `I have noticed changes in: ${checkedChanges.join(', ')}`
            : 'No recent changes noticed';

        // Show loading state
        analysisContent.innerHTML = '<div class="loading">Analyzing image...</div>';
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';

        // Prepare the prompt
        const messages = [
            {
                role: "system",
                content: "You are an AI model specialized in dermatology and skin health. Analyze images of moles and skin spots to identify clinical features that may indicate a risk of skin cancer (e.g., asymmetry, borders, color, diameter, evolution—\"ABCDE\" criteria). Provide an estimated percentage risk of malignancy based on those criteria, briefly explain which findings support your evaluation, and suggest the next step (e.g., medical consultation) with a notice that you do not replace a professional's opinion."
            },
            {
                role: "user",
                content: `An image of a mole on the skin is attached. Additionally, the person states: '${userAnswer}'. Please:
1. Describe its relevant characteristics using the ABCDE criteria: Asymmetry, Borders, Color, Diameter, Evolution.
2. Based on that description, estimate the probability that it is malignant (10%–90%, in 5% increments) and briefly explain which findings influenced that estimate.`
            }
        ];

        // Send request to OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: messages,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || 'Failed to get analysis from AI');
        }

        const data = await response.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message?.content) {
            throw new Error('Invalid response from AI');
        }

        const analysis = data.choices[0].message.content;

        // Display results
        resultsSection.classList.remove('hidden');
        analysisContent.innerHTML = `
            <div class="analysis-text">${analysis}</div>
            <div class="warning">
                <i class="fas fa-exclamation-triangle"></i>
                Important: This analysis is for informational purposes only and should not replace professional medical advice. Please consult a healthcare provider for accurate diagnosis and treatment.
            </div>
        `;

    } catch (error) {
        showError(error.message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze Mole';
    }
}

// Show error message
function showError(message) {
    analysisContent.innerHTML = `
        <div class="error">
            <i class="fas fa-exclamation-circle"></i>
            ${message}
        </div>
    `;
}

// Handle image upload
moleImage.addEventListener('change', handleImageUpload);

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = function(e) {
        preview.innerHTML = `<img src="${e.target.result}" alt="Mole Preview">`;
    };
    reader.readAsDataURL(file);

    // Enable analyze button
    analyzeBtn.disabled = false;
}

// Handle analyze button click
analyzeBtn.addEventListener('click', async function() {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing...';

    try {
        const imageBase64 = preview.querySelector('img').src;
        
        // Get selected changes
        const checkedChanges = Array.from(changesCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
        const userAnswer = checkedChanges.length > 0 
            ? `I have noticed changes in: ${checkedChanges.join(', ')}`
            : 'No recent changes noticed';

        // Prepare the prompt
        const messages = [
            {
                role: "system",
                content: "You are an AI model specialized in dermatology and skin health. Analyze images of moles and skin spots to identify clinical features that may indicate a risk of skin cancer (e.g., asymmetry, borders, color, diameter, evolution—\"ABCDE\" criteria). Provide an estimated percentage risk of malignancy based on those criteria, briefly explain which findings support your evaluation, and suggest the next step (e.g., medical consultation) with a notice that you do not replace a professional's opinion."
            },
            {
                role: "user",
                content: `An image of a mole on the skin is attached. Additionally, the person states: '${userAnswer}'. Please:
1. Describe its relevant characteristics using the ABCDE criteria: Asymmetry, Borders, Color, Diameter, Evolution.
2. Based on that description, estimate the probability that it is malignant (10%–90%, in 5% increments) and briefly explain which findings influenced that estimate.`
            }
        ];

        // Send request to OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: messages,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get analysis from AI');
        }

        const data = await response.json();
        const analysis = data.choices[0].message.content;

        // Display results
        resultsSection.classList.remove('hidden');
        analysisContent.innerHTML = `
            <div>${analysis}</div>
            <div class="warning">
                Important: This analysis is for informational purposes only and should not replace professional medical advice. Please consult a healthcare provider for accurate diagnosis and treatment.
            </div>
        `;

    } catch (error) {
        analysisContent.innerHTML = `<div class="warning">Error: ${error.message}</div>`;
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze Mole';
    }
});
