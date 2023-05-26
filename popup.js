document.addEventListener("DOMContentLoaded", function() {
    var captureButton = document.getElementById("captureButton");
    captureButton.addEventListener("click", captureScreenshot);
  });
  
  function captureScreenshot() {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, function (dataUrl) {
      // Create a temporary canvas to draw the screenshot
      var canvas = document.createElement("canvas");
      var context = canvas.getContext("2d");
      var img = new Image();
  
      img.onload = function () {
        // Set canvas dimensions to match the screenshot
        canvas.width = img.width;
        canvas.height = img.height;
  
        // Draw the screenshot onto the canvas
        context.drawImage(img, 0, 0);
  
        // Compare pixels and mute audio if necessary
        compareScreenshot(canvas.toDataURL("image/png"));
      };
  
      img.src = dataUrl;
    });
  }
  
  function compareScreenshot(screenshotDataUrl) {
    // Load the reference image
    var referenceImage = new Image();
    referenceImage.src = chrome.runtime.getURL("assets/demo1.png");
  
    referenceImage.onload = function () {
      // Create a temporary canvas to draw the reference image
      var canvas = document.createElement("canvas");
      var context = canvas.getContext("2d");
  
      // Set canvas dimensions to match the reference image
      canvas.width = referenceImage.width;
      canvas.height = referenceImage.height;
  
      // Draw the reference image onto the canvas
      context.drawImage(referenceImage, 0, 0);
  
      // Get the pixel data for the reference image
      var referenceImageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
  
      // Get the pixel data for the captured screenshot
      var screenshotImage = new Image();
      screenshotImage.src = screenshotDataUrl;
  
      screenshotImage.onload = function () {
        // Create a temporary canvas to draw the captured screenshot
        var screenshotCanvas = document.createElement("canvas");
        var screenshotContext = screenshotCanvas.getContext("2d");
  
        // Set canvas dimensions to match the screenshot
        screenshotCanvas.width = screenshotImage.width;
        screenshotCanvas.height = screenshotImage.height;
  
        // Draw the captured screenshot onto the canvas
        screenshotContext.drawImage(screenshotImage, 0, 0);
  
        // Get the pixel data for the captured screenshot
        var screenshotImageData = screenshotContext.getImageData(0, 0, screenshotCanvas.width, screenshotCanvas.height).data;
  
        // Compare pixels
        var pixelsMatch = comparePixels(referenceImageData, screenshotImageData);
  
        // Mute tab audio if pixels match
        if (pixelsMatch) {
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.update(tabs[0].id, { muted: true });
          });
        }
      };
    };
  }
  
  function comparePixels(referenceImageData, screenshotImageData) {
    // Compare pixel data here and return true if they match, false otherwise
    // Example comparison logic:
    return JSON.stringify(referenceImageData) === JSON.stringify(screenshotImageData);
  }
  