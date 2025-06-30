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

async function handleAnalyze() {
    if (analyzeBtn.disabled) return;
    analyzeBtn.disabled = true;
    resultsSection.classList.remove('hidden');
    analysisContent.innerHTML = '<div class="loading"><span class="spinner"></span> Analyzing, please wait...</div>';
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
        const payload = {
            image: imageBase64,
            changes: checkedChanges
        };

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Medical analysis service temporarily unavailable.');
        const data = await response.json();
        renderResults(data);
    } catch (err) {
        analysisContent.innerHTML = `<div class="error"><i class="fas fa-exclamation-triangle"></i> ${err.message}</div>`;
    } finally {
        analyzeBtn.disabled = false;
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
    // Risk badge box
    const riskBadgeBox = `
        <div class="risk-badge-box ${riskClass}-risk">
            <div class="risk-percentage">${typeof risk.percentage !== 'undefined' ? risk.percentage + '%' : 'N/A'}</div>
            <div class="risk-label ${riskClass}-risk">${risk.level ? risk.level.toUpperCase() + ' RISK' : 'UNKNOWN'}</div>
        </div>
    `;
    return `
        <div class="analysis-results">
            <div class="risk-assessment ${riskClass}-risk">
                <div class="risk-header">
                    <h4><i class="fas fa-chart-line"></i> Risk Assessment</h4>
                    ${riskBadgeBox}
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
                            <p>${criteria[criterion] || 'Not provided'}</p>
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

function renderResults(data) {
    if (!data || !data.result) {
        analysisContent.innerHTML = '<div class="error">No valid analysis received. Please try again.</div>';
        return;
    }
    let parsed = null;
    let warning = '';
    try {
        parsed = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
    } catch (e) {
        parsed = parseAnalysisResponse(data.result);
        warning = `<div class='error'><i class='fas fa-exclamation-circle'></i> <strong>Warning:</strong> The response was not in the expected JSON format. Displaying best-effort parsing.</div>`;
    }
    analysisContent.innerHTML = `
        ${generateResultsHTML(parsed)}
        ${warning}
        <div class="warning">
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Medical Disclaimer:</strong> This analysis is a screening tool for informational purposes only. It does not constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for proper medical evaluation and care. If you experience rapid changes, bleeding, or concerning symptoms, seek immediate medical attention.
        </div>
    `;
} 