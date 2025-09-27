/**
 * Shared JavaScript functionality for all placement test sections
 * This file contains common functions used across the different test types
 */

// Format time from seconds to MM:SS
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Scroll to element with smooth animation
function scrollToElement(element) {
    element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

// Show element with fade-in animation
function showElement(element, displayType = 'block') {
    if (element.classList.contains('hidden')) {
        element.classList.remove('hidden');
        element.style.display = displayType;
        element.style.opacity = '0';
        setTimeout(() => {
            element.style.transition = 'opacity 0.5s';
            element.style.opacity = '1';
        }, 10);
    }
}

// Hide element with fade-out animation
function hideElement(element) {
    if (!element.classList.contains('hidden')) {
        element.style.transition = 'opacity 0.5s';
        element.style.opacity = '0';
        setTimeout(() => {
            element.style.display = 'none';
            element.classList.add('hidden');
        }, 500);
    }
}

// Save data to localStorage
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Error saving to localStorage:', error);
        return false;
    }
}

// Get data from localStorage
function getFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Error getting from localStorage:', error);
        return null;
    }
}

// Clear test data from localStorage
function clearTestData(testType) {
    try {
        localStorage.removeItem(`${testType}_test_data`);
        return true;
    } catch (error) {
        console.error('Error clearing test data:', error);
        return false;
    }
}

// Display a notification message
function showNotification(message, type = 'info', duration = 3000) {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        document.body.appendChild(notification);
    }
    
    // Set message and type
    notification.textContent = message;
    notification.className = `notification ${type}`;
    
    // Show notification
    notification.classList.add('show');
    
    // Hide after duration
    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

// Format time for SCORM (HH:MM:SS)
function formatScormTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Generic SCORM helper functions
function initScormWrapper(testType) {
    const scorm = window.pipwerks && window.pipwerks.SCORM;
    
    if (scorm) {
        const connected = scorm.init();
        
        if (connected) {
            console.log(`SCORM connection established for ${testType} test`);
            
            // Set lesson status to "incomplete" when starting
            scorm.set("cmi.core.lesson_status", "incomplete");
            scorm.save();
            
            return true;
        } else {
            console.error(`Failed to establish SCORM connection for ${testType} test`);
        }
    } else {
        console.warn("SCORM API wrapper not found");
    }
    
    return false;
}

// Send data to Google Sheets
function sendToGoogleSheet(testType, data, spreadsheetUrl) {
    // Default to the main Google Apps Script URL if not provided
    const url = spreadsheetUrl || "YOUR_WEB_APP_URL_HERE";
    
    // Add test type if not included
    if (!data.testType) {
        data.testType = testType;
    }
    
    // Add timestamp if not included
    if (!data.date) {
        data.date = new Date().toISOString();
    }
    
    // Send data
    return fetch(url, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
    })
    .then(res => res.text())
    .then(res => {
        console.log(`Google Sheet response for ${testType}:`, res);
        return res;
    })
    .catch(err => {
        console.error(`Error sending ${testType} results to Google Sheet:`, err);
        throw err;
    });
}

// Export common functions
window.testUtils = {
    formatTime,
    formatScormTime,
    shuffleArray,
    scrollToElement,
    showElement,
    hideElement,
    saveToLocalStorage,
    getFromLocalStorage,
    clearTestData,
    showNotification,
    initScormWrapper,
    sendToGoogleSheet
};