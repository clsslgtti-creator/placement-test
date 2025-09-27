# SLGTTI Language Placement Test - SCORM Implementation

This placement test is implemented as a SCORM 1.2 package with multiple SCOs (Sharable Content Objects), where each test section (Grammar, Reading, Writing, Speaking, and Listening) functions as a separate SCO. This allows the LMS to track completion and scores for each section independently.

## SCORM Implementation Details

### File Structure

- `imsmanifest.xml` - The SCORM manifest file that describes the package structure
- `assets/js/pipwerks-scorm.js` - SCORM API wrapper for JavaScript
- `assets/js/common.js` - Shared JavaScript functions, including SCORM helper functions
- Test sections (each is a separate SCO):
  - `grammar/`
  - `reading/`
  - `listening/`
  - `speaking/`
  - `writing/`

### How SCORM Integration Works

1. **SCORM Initialization**
   - Each test section initializes a connection to the SCORM LMS when loaded
   - The initial status is set to "incomplete"

2. **SCORM Completion**
   - When a test is completed, the script:
     - Calculates the score as a percentage (0-100)
     - Sets the raw score in the LMS
     - Sets the minimum score (0) and maximum score (100)
     - Records the session time
     - Marks the test as "completed" if the score is 70% or higher
     - Saves the data to the LMS

3. **SCORM Data Points**
   - `cmi.core.score.raw` - The raw score (0-100)
   - `cmi.core.score.min` - Minimum possible score (0)
   - `cmi.core.score.max` - Maximum possible score (100)
   - `cmi.core.session_time` - Time spent on the test (format: HH:MM:SS)
   - `cmi.core.lesson_status` - Status of the test ("incomplete" or "completed")

## Implementation for Other Test Sections

For other test sections (Reading, Writing, Speaking, Listening), follow these steps to implement SCORM functionality:

1. Update the script.js file to include SCORM initialization, submission, and termination functions.
2. Implement the submitScormResults function to calculate and submit:
   - Score percentage
   - Session time
   - Completion status

Example implementation:

```javascript
// Initialize SCORM when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize SCORM connection
    initScorm();
    
    // Rest of your initialization code...
});

// Submit results to SCORM LMS
function submitScormResults() {
    if (!scorm || !scorm.connection.isActive) {
        console.warn("SCORM connection is not active, cannot submit results");
        return;
    }
    
    try {
        // Get score from your test
        const score = /* Calculate score */;
        const totalPossible = /* Total possible score */;
        
        // Calculate score as a percentage
        const scorePercentage = Math.round((score / totalPossible) * 100);
        
        // Set the score
        scorm.set("cmi.core.score.raw", scorePercentage);
        scorm.set("cmi.core.score.min", "0");
        scorm.set("cmi.core.score.max", "100");
        
        // Calculate and set session time
        const timeSpent = /* Calculate time spent in seconds */;
        const scormTime = window.testUtils.formatScormTime(timeSpent);
        scorm.set("cmi.core.session_time", scormTime);
        
        // Set completion status
        if (scorePercentage >= 70) {
            scorm.set("cmi.core.lesson_status", "completed");
        } else {
            scorm.set("cmi.core.lesson_status", "incomplete");
        }
        
        // Save the data
        scorm.save();
    } catch (error) {
        console.error("Error submitting SCORM results:", error);
    }
}
```

## Packaging for LMS Upload

To package the content for LMS upload:

1. Include all necessary files as specified in the imsmanifest.xml
2. Create a zip file containing:
   - imsmanifest.xml
   - All content folders (grammar, reading, etc.)
   - All assets (js, css, etc.)
   - Any required schema files (optional, many LMSs don't require these)
3. Upload the zip file to your LMS as a SCORM package

## Dual-Use Considerations

The package is designed for two purposes:

1. **LMS Integration** - Each test section functions as a standalone SCO that can be tracked independently
2. **Standalone Use** - The main index.html provides a portal to all test sections when used outside an LMS

When uploaded to an LMS, users will typically access individual test sections directly, and the LMS will track completion of each section. When used standalone, users will navigate through the main index.html to access all test sections.

## Google Sheets Integration

In addition to SCORM reporting, the placement test also sends detailed results to a Google Spreadsheet, providing:

1. **Centralized Reporting** - All test results are collected in one place, regardless of LMS limitations
2. **Detailed Analysis** - Full question and answer details are recorded for analysis
3. **LMS-Independent Tracking** - Works even when used outside of an LMS environment

### Setup Instructions

1. Create a Google Apps Script Web App:
   - Create a new Google Spreadsheet
   - Go to Extensions > Apps Script
   - Create a new script with the following code:

```javascript
function doPost(e) {
  try {
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Get the active spreadsheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Select or create the appropriate sheet based on test type
    let sheet = ss.getSheetByName(data.testType);
    if (!sheet) {
      sheet = ss.insertSheet(data.testType);
      // Add headers for this new sheet
      sheet.appendRow([
        "Date", "Name", "Student ID", "Score", "Total Questions", 
        "Score %", "Time Spent", "Test Type", "Detailed Answers"
      ]);
    }
    
    // Format the detailed answers for storage
    const detailedAnswers = JSON.stringify(data.answers);
    
    // Append data to the sheet
    sheet.appendRow([
      new Date(data.date),
      data.name,
      data.studentId || "",
      data.score,
      data.totalQuestions,
      data.scorePercentage + "%",
      data.timeSpent,
      data.testType,
      detailedAnswers
    ]);
    
    // Return success
    return ContentService.createTextOutput("Success: Data recorded")
      .setMimeType(ContentService.MimeType.TEXT);
      
  } catch(error) {
    // Return error
    return ContentService.createTextOutput("Error: " + error.message)
      .setMimeType(ContentService.MimeType.TEXT);
  }
}
```

2. Deploy the script as a web app:
   - Click Deploy > New deployment
   - Choose "Web app" as the type
   - Set "Who has access" to "Anyone" (or "Anyone, even anonymous" in older versions)
   - Deploy and copy the web app URL

3. Update the URL in your code:
   - Replace `YOUR_WEB_APP_URL_HERE` in the common.js file with your actual web app URL
   - This can be set either globally in common.js or for each test section individually

### Data Collected

For each test attempt, the following data is sent to the Google Spreadsheet:

- Test type (Grammar, Reading, Writing, etc.)
- Student name (from SCORM or prompted)
- Student ID (if available from SCORM)
- Score and total questions
- Score percentage
- Time spent on the test
- Date and time of completion
- Detailed information about each question and answer