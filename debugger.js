// file: debugger.js (Simplified Version)

(function() {
  // This function will run for the very first critical error that occurs.
  window.onerror = function(message, source, lineno, colno, error) {
    // Display the error in a prominent alert box
    alert(
      "A critical error occurred:\n\n" +
      "Message: " + message + "\n" +
      "Source: " + source + "\n" +
      "Line: " + lineno + ", Column: " + colno + "\n\n" +
      "This error is preventing the application from starting."
    );

    // Return true to prevent the browser from showing its own error message in the console.
    return true;
  };

  console.log('Minimal Error Catcher is active.');
})();
