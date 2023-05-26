document.addEventListener("DOMContentLoaded", function() {
  var captureButton = document.getElementById("captureButton");
  captureButton.addEventListener("click", startScreenshotInterval);
});

var screenshotInterval;

function startScreenshotInterval() {
  // Capture initial screenshot immediately
  captureScreenshot();
  // Capture screenshots every 5 seconds
  screenshotInterval = setInterval(captureScreenshot, 5000);
}

function captureScreenshot() {
  chrome.tabs.captureVisibleTab(null, { format: "png" }, function (dataUrl) {
    var image = new Image();

    image.onload = function() {
      // Define the coordinates and dimensions of the desired cropping area
      var cropX = 170;     // X-coordinate of the top-left corner of the cropping area
      var cropY = 110;     // Y-coordinate of the top-left corner of the cropping area
      var cropWidth = 300; // Width of the cropping area
      var cropHeight = 200; // Height of the cropping area

      // Create a temporary canvas to draw the screenshot image
      var tempCanvas = document.createElement("canvas");
      var tempContext = tempCanvas.getContext("2d");
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;

      // Draw the screenshot image onto the temporary canvas
      tempContext.drawImage(image, 0, 0);

      // Crop the screenshot
      var croppedDataUrl = cropScreenshot(tempCanvas, cropX, cropY, cropWidth, cropHeight);

      // Compare pixels and mute audio if necessary
      compareScreenshot(croppedDataUrl);
      
      // Display the captured screenshot
      showScreenshot(croppedDataUrl);
    };

    image.src = dataUrl;
  });
}

function showScreenshot(dataUrl) {
  // Create an image element
  var screenshotImage = document.createElement("img");
  
  // Set the source of the image to the captured screenshot data URL
  screenshotImage.src = dataUrl;
  
  // Append the image to the document body
  document.body.appendChild(screenshotImage);
}


function cropScreenshot(image, x, y, width, height) {
  var canvas = document.createElement("canvas");
  var context = canvas.getContext("2d");

  // Set the dimensions of the canvas to match the cropped area
  canvas.width = width;
  canvas.height = height;

  // Draw the cropped area onto the canvas
  context.drawImage(image, x, y, width, height, 0, 0, width, height);

  // Return the cropped image data URL
  return canvas.toDataURL("image/png");
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
    canvas.width = 300;
    canvas.height = 200;

    // Draw the reference image onto the canvas
    context.drawImage(referenceImage, 170, 110, 300, 200, 0, 0, 300, 200);

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
