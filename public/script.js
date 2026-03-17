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

let imageBase64 = null;

document.addEventListener('DOMContentLoaded', () => {
    moleImage.addEventListener('change', handleImageUpload);
    analyzeBtn.addEventListener('click', handleAnalyze);
    changesCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateAnalyzeButton);
    });
});

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file.');
        moleImage.value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB.');
        moleImage.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
        imageBase64 = event.target.result.split(',')[1];
        preview.innerHTML = `
            <img src="${event.target.result}" alt="Mole preview"/>
            <button class="clear-preview" title="Remove image" aria-label="Remove image">
                <i class="fas fa-times"></i>
            </button>
        `;
        preview.classList.add('has-image');
        const clearBtn = preview.querySelector('.clear-preview');
        clearBtn.addEventListener('click', () => {
            moleImage.value = '';
            imageBase64 = null;
            preview.innerHTML = `
                <div class="placeholder">
                    <i class="fas fa-image"></i>
                    <p>Drag or select a photo of your mole or skin spot here</p>
                </div>
            `;
            preview.classList.remove('has-image');
            updateAnalyzeButton();
        });
        updateAnalyzeButton();
    };
    reader.readAsDataURL(file);
}

function updateAnalyzeButton() {
    const hasImage = preview.querySelector('img') !== null;
    const hasChanges = Array.from(changesCheckboxes).some(checkbox => checkbox.checked);
    analyzeBtn.disabled = !hasImage && !hasChanges;
}

// =============================================================================
// AI INTEGRATION — PROMPT ENGINEERING
// =============================================================================
//
// Model: OpenAI GPT-4o (multimodal — supports both text and image input)
//
// System prompt design:
//   The system prompt frames the model as a dermatology-specialized medical AI
//   and instructs it to evaluate skin lesions using the clinical ABCDE criteria:
//     A — Asymmetry      B — Border irregularity    C — Color variation
//     D — Diameter       E — Evolution (changes over time)
//
// Structured JSON output:
//   Both prompts (image + text-only) append jsonInstructions, which enforces
//   a strict JSON response schema:
//     { criteria: {A,B,C,D,E}, risk: {percentage, level, findings}, recommendation }
//   This allows reliable programmatic parsing of the AI response without
//   relying on brittle text extraction.
//
// Malignancy risk range (10%–90% in 5% increments):
//   The range is bounded to avoid conveying false certainty (0% or 100%).
//   5% increments communicate that this is an estimate, not a binary outcome.
//
// Two prompt paths:
//   1. Image + clinical history  → multimodal message (vision + text)
//   2. Clinical history only     → text-only message
//   Both paths use the same JSON schema for consistent response handling.
//
// Response parsing:
//   Primary:  JSON.parse after stripping markdown code fences (```json ... ```)
//   Fallback: regex-based markdown parser (parseAnalysisResponse) used when
//             the model returns markdown instead of raw JSON despite instructions
// =============================================================================

async function handleAnalyze() {
    if (analyzeBtn.disabled) return;
    try {
        const imageElement = preview.querySelector('img');
        const hasImage = imageElement !== null;
        const checkedChanges = Array.from(changesCheckboxes)
            .filter(checkbox => checkbox.checked)
            .map(checkbox => checkbox.value);
        if (!hasImage && checkedChanges.length === 0) {
            throw new Error('Please upload a medical image or select clinical changes to proceed with analysis');
        }
        const userAnswer = checkedChanges.length > 0 
            ? `Patient reports clinical changes in: ${checkedChanges.join(', ')}`
            : 'No recent clinical changes reported';
        resultsSection.classList.remove('hidden');
        analysisContent.innerHTML = '<div class="loading">Performing medical analysis...</div>';
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        let messages = [];
        // JSON schema instruction appended to every prompt to enforce structured output.
        // Appending it to both system and user messages increases compliance rate.
        const jsonInstructions = `\n\nPlease provide your analysis in the following JSON format (and nothing else):\n{\n  "criteria": {\n    "Asymmetry": "...",\n    "Border": "...",\n    "Color": "...",\n    "Diameter": "...",\n    "Evolution": "..."\n  },\n  "risk": {\n    "percentage": 0-100,\n    "level": "Low|Medium|High",\n    "findings": "..."\n  },\n  "recommendation": "..."\n}\nIf information is missing, use an empty string. Do not add any extra text or explanation outside the JSON.`;
        // Path 1: Multimodal — image + clinical history
        // Uses GPT-4o vision: message content is an array with text + image_url blocks.
        // Image is sent as base64-encoded JPEG with detail:"high" for fine-grained analysis.
        if (hasImage && imageBase64) {
            messages = [
                {
                    role: "system",
                    content: "You are a medical AI assistant specialized in dermatology and skin health assessment. Analyze the provided skin lesion image using the ABCDE criteria (Asymmetry, Border irregularity, Color variation, Diameter, Evolution) to identify potential risk factors for skin cancer. Provide an estimated percentage risk of malignancy based on those criteria, briefly explain which findings support your evaluation, and suggest the next step." + jsonInstructions
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Patient clinical history: '${userAnswer}'. Please provide a comprehensive medical analysis including:\n1. Describe its relevant characteristics using the ABCDE criteria: Asymmetry, Borders, Color, Diameter, Evolution\n2. Based on that description, estimate the probability that it is malignant (10%–90%, in 5% increments) and briefly explain which findings influenced that estimate.\n\nUse professional medical terminology and maintain a clinical, authoritative tone.` + jsonInstructions
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`,
                                detail: "high"
                            }
                        }
                    ]
                }
            ];
        // Path 2: Text-only — clinical history checkboxes without an image
        } else {
            messages = [
                {
                    role: "system",
                    content: "You are a medical AI assistant specialized in dermatology and skin health assessment. Analyze skin lesions and moles using the ABCDE criteria (Asymmetry, Border irregularity, Color variation, Diameter, Evolution) to identify potential risk factors for skin cancer. Provide an estimated percentage risk of malignancy based on those criteria, briefly explain which findings support your evaluation, and suggest the next step." + jsonInstructions
                },
                {
                    role: "user",
                    content: `Patient clinical history: '${userAnswer}'. Please provide a comprehensive medical analysis including:\n1. Describe its relevant characteristics using the ABCDE criteria: Asymmetry, Borders, Color, Diameter, Evolution (only if "Patient clinical history" is available)\n2. Based on that description, estimate the probability that it is malignant (10%–90%, in 5% increments) and briefly explain which findings influenced that estimate.\n\nUse professional medical terminology and maintain a clinical, authoritative tone.` + jsonInstructions
                }
            ];
        }
        // Route through Netlify serverless function to keep the OpenAI API key server-side.
        // gpt-4o: chosen for vision capability and strong instruction-following for JSON output.
        // max_tokens: 500 is sufficient for the structured JSON schema defined above.
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: messages,
                max_tokens: 500
            })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(errorData?.error?.message || 'Medical analysis service temporarily unavailable. Please try again.');
        }
        const data = await response.json();
        let analysis = data.choices[0].message.content;
        let parsed = null;
        let warning = '';
        try {
            // Primary parser: strip markdown fences (```json...```) then JSON.parse
            analysis = analysis.trim().replace(/^```json|^```|```$/g, '');
            parsed = JSON.parse(analysis);
        } catch (e) {
            // Fallback parser: regex-based extraction for markdown-formatted responses
            parsed = parseAnalysisResponse(analysis);
            warning = `<div class='error'><i class='fas fa-exclamation-circle'></i> <strong>Warning:</strong> The response was not in the expected JSON format. Displaying best-effort parsing.</div>`;
        }
        resultsSection.classList.remove('hidden');
        analysisContent.innerHTML = `
            ${generateResultsHTML(parsed)}
            ${warning}
            <div class="warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Medical Disclaimer:</strong> This analysis is a screening tool for informational purposes only. It does not constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for proper medical evaluation and care. If you experience rapid changes, bleeding, or concerning symptoms, seek immediate medical attention.
            </div>
        `;
    } catch (error) {
        showError(error.message);
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<i class="fas fa-stethoscope"></i> Analyze with Medical AI';
    }
}

function showError(message) {
    resultsSection.classList.remove('hidden');
    analysisContent.innerHTML = `
        <div class="error">
            <i class="fas fa-exclamation-circle"></i>
            <strong>Analysis Error:</strong> ${message}
        </div>
    `;
}

function showSuccess(message) {
    resultsSection.classList.remove('hidden');
    analysisContent.innerHTML = `
        <div class="success">
            <i class="fas fa-check-circle"></i>
            ${message}
        </div>
    `;
}

function parseAnalysisResponse(response) {
    const analysis = {
        criteria: {},
        riskAssessment: {},
        recommendations: ''
    };
    const abcdeSectionMatch = response.match(/ABCDE Criteria (Evaluation|Analysis)?[\s\S]*?(?=###|$)/i);
    let abcdeSection = abcdeSectionMatch ? abcdeSectionMatch[0] : '';
    if (!abcdeSection) {
        abcdeSection = response;
    }
    const criteriaRegex = /\d+\.\s*\*\*([A-Za-z]+)\*\*:?\s*([\s\S]*?)(?=\n\d+\.|$)/g;
    let match;
    while ((match = criteriaRegex.exec(abcdeSection)) !== null) {
        const criterion = match[1].trim();
        const description = match[2].replace(/\n/g, ' ').trim();
        analysis.criteria[criterion] = description;
    }
    const riskSectionMatch = response.match(/Malignancy Risk Estimate[\s\S]*?(?=###|$)/i);
    let riskSection = riskSectionMatch ? riskSectionMatch[0] : '';
    if (riskSection) {
        const percentMatch = riskSection.match(/(\d{1,3})%/);
        if (percentMatch) {
            analysis.riskAssessment.percentage = parseInt(percentMatch[1]);
            analysis.riskAssessment.level = getRiskLevel(analysis.riskAssessment.percentage);
        }
        analysis.riskAssessment.findings = riskSection.replace(/Malignancy Risk Estimate/i, '').replace(/\*\*/g, '').trim();
    } else {
        const percentMatch = response.match(/(\d{1,3})%/);
        if (percentMatch) {
            analysis.riskAssessment.percentage = parseInt(percentMatch[1]);
            analysis.riskAssessment.level = getRiskLevel(analysis.riskAssessment.percentage);
        }
    }
    const recSectionMatch = response.match(/Recommendation[\s\S]*?(?=###|$)/i);
    if (recSectionMatch) {
        analysis.recommendations = recSectionMatch[0].replace(/Recommendation:?/i, '').trim();
    }
    return analysis;
}

function getRiskLevel(percentage) {
    if (percentage < 30) return 'Low';
    if (percentage < 60) return 'Medium';
    return 'High';
}

function generateResultsHTML(analysis) {
    const risk = analysis.risk || analysis.riskAssessment || {};
    const criteria = analysis.criteria || {};
    const recommendation = analysis.recommendation || analysis.recommendations || '';
    const riskClass = (risk.level || 'Unknown').toLowerCase();
    return `
        <div class="analysis-results">
            <div class="risk-assessment ${riskClass}-risk">
                <div class="risk-header">
                    <h4><i class="fas fa-chart-line"></i> Risk Assessment</h4>
                    <div class="risk-badge ${riskClass}-risk">
                        <span class="risk-percentage">${typeof risk.percentage !== 'undefined' ? risk.percentage : 'N/A'}%</span>
                        <span class="risk-level">${risk.level || 'Unknown'} Risk</span>
                    </div>
                </div>
                ${risk.findings ? `<div class="findings-content">${risk.findings}</div>` : ''}
            </div>
            <div class="abcde-analysis">
                <h4><i class="fas fa-microscope"></i> ABCDE Criteria Analysis</h4>
                <div class="criteria-grid">
                    ${['Asymmetry','Border','Color','Diameter','Evolution'].map(criterion => `
                        <div class="criterion-item">
                            <div class="criterion-header">
                                <span class="criterion-letter">${criterion.charAt(0)}</span>
                                <h5>${criterion}</h5>
                            </div>
                            <p>${criteria[criterion] || 'No information provided.'}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            ${recommendation ? `
                <div class="recommendations-section">
                    <h4><i class="fas fa-user-md"></i> Medical Recommendations</h4>
                    <div class="recommendations-content">
                        ${recommendation}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
} 