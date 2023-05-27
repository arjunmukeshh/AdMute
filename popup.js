//PixelMatch library code till line 234.
const defaultOptions = {
  threshold: 0.1,         // matching threshold (0 to 1); smaller is more sensitive
  includeAA: false,       // whether to skip anti-aliasing detection
  alpha: 0.1,             // opacity of original image in diff output
  aaColor: [255, 255, 0], // color of anti-aliased pixels in diff output
  diffColor: [255, 0, 0], // color of different pixels in diff output
  diffColorAlt: null,     // whether to detect dark on light differences between img1 and img2 and set an alternative color to differentiate between the two
  diffMask: false         // draw the diff over a transparent background (a mask)
};

function pixelmatch(img1, img2, output, width, height, options) {

  if (!isPixelData(img1) || !isPixelData(img2) || (output && !isPixelData(output)))
      throw new Error('Image data: Uint8Array, Uint8ClampedArray or Buffer expected.');

  if (img1.length !== img2.length || (output && output.length !== img1.length))
      throw new Error('Image sizes do not match.');

  if (img1.length !== width * height * 4) throw new Error('Image data size does not match width/height.');

  options = Object.assign({}, defaultOptions, options);

  // check if images are identical
  const len = width * height;
  const a32 = new Uint32Array(img1.buffer, img1.byteOffset, len);
  const b32 = new Uint32Array(img2.buffer, img2.byteOffset, len);
  let identical = true;

  for (let i = 0; i < len; i++) {
      if (a32[i] !== b32[i]) { identical = false; break; }
  }
  if (identical) { // fast path if identical
      if (output && !options.diffMask) {
          for (let i = 0; i < len; i++) drawGrayPixel(img1, 4 * i, options.alpha, output);
      }
      return 0;
  }

  // maximum acceptable square distance between two colors;
  // 35215 is the maximum possible value for the YIQ difference metric
  const maxDelta = 35215 * options.threshold * options.threshold;
  let diff = 0;

  // compare each pixel of one image against the other one
  for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {

          const pos = (y * width + x) * 4;

          // squared YUV distance between colors at this pixel position, negative if the img2 pixel is darker
          const delta = colorDelta(img1, img2, pos, pos);

          // the color difference is above the threshold
          if (Math.abs(delta) > maxDelta) {
              // check it's a real rendering difference or just anti-aliasing
              if (!options.includeAA && (antialiased(img1, x, y, width, height, img2) ||
                                         antialiased(img2, x, y, width, height, img1))) {
                  // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
                  // note that we do not include such pixels in a mask
                  if (output && !options.diffMask) drawPixel(output, pos, ...options.aaColor);

              } else {
                  // found substantial difference not caused by anti-aliasing; draw it as such
                  if (output) {
                      drawPixel(output, pos, ...(delta < 0 && options.diffColorAlt || options.diffColor));
                  }
                  diff++;
              }

          } else if (output) {
              // pixels are similar; draw background as grayscale image blended with white
              if (!options.diffMask) drawGrayPixel(img1, pos, options.alpha, output);
          }
      }
  }

  // return the number of different pixels
  return diff;
}

function isPixelData(arr) {
  // work around instanceof Uint8Array not working properly in some Jest environments
  return ArrayBuffer.isView(arr) && arr.constructor.BYTES_PER_ELEMENT === 1;
}

// check if a pixel is likely a part of anti-aliasing;
// based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009

function antialiased(img, x1, y1, width, height, img2) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX, minY, maxX, maxY;

  // go through 8 adjacent pixels
  for (let x = x0; x <= x2; x++) {
      for (let y = y0; y <= y2; y++) {
          if (x === x1 && y === y1) continue;

          // brightness delta between the center pixel and adjacent one
          const delta = colorDelta(img, img, pos, (y * width + x) * 4, true);

          // count the number of equal, darker and brighter adjacent pixels
          if (delta === 0) {
              zeroes++;
              // if found more than 2 equal siblings, it's definitely not anti-aliasing
              if (zeroes > 2) return false;

          // remember the darkest pixel
          } else if (delta < min) {
              min = delta;
              minX = x;
              minY = y;

          // remember the brightest pixel
          } else if (delta > max) {
              max = delta;
              maxX = x;
              maxY = y;
          }
      }
  }

  // if there are no both darker and brighter pixels among siblings, it's not anti-aliasing
  if (min === 0 || max === 0) return false;

  // if either the darkest or the brightest pixel has 3+ equal siblings in both images
  // (definitely not anti-aliased), this pixel is anti-aliased
  return (hasManySiblings(img, minX, minY, width, height) && hasManySiblings(img2, minX, minY, width, height)) ||
         (hasManySiblings(img, maxX, maxY, width, height) && hasManySiblings(img2, maxX, maxY, width, height));
}

// check if a pixel has 3+ adjacent pixels of the same color.
function hasManySiblings(img, x1, y1, width, height) {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = (y1 * width + x1) * 4;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

  // go through 8 adjacent pixels
  for (let x = x0; x <= x2; x++) {
      for (let y = y0; y <= y2; y++) {
          if (x === x1 && y === y1) continue;

          const pos2 = (y * width + x) * 4;
          if (img[pos] === img[pos2] &&
              img[pos + 1] === img[pos2 + 1] &&
              img[pos + 2] === img[pos2 + 2] &&
              img[pos + 3] === img[pos2 + 3]) zeroes++;

          if (zeroes > 2) return true;
      }
  }

  return false;
}

// calculate color difference according to the paper "Measuring perceived color difference
// using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos

function colorDelta(img1, img2, k, m, yOnly) {
  let r1 = img1[k + 0];
  let g1 = img1[k + 1];
  let b1 = img1[k + 2];
  let a1 = img1[k + 3];

  let r2 = img2[m + 0];
  let g2 = img2[m + 1];
  let b2 = img2[m + 2];
  let a2 = img2[m + 3];

  if (a1 === a2 && r1 === r2 && g1 === g2 && b1 === b2) return 0;

  if (a1 < 255) {
      a1 /= 255;
      r1 = blend(r1, a1);
      g1 = blend(g1, a1);
      b1 = blend(b1, a1);
  }

  if (a2 < 255) {
      a2 /= 255;
      r2 = blend(r2, a2);
      g2 = blend(g2, a2);
      b2 = blend(b2, a2);
  }

  const y1 = rgb2y(r1, g1, b1);
  const y2 = rgb2y(r2, g2, b2);
  const y = y1 - y2;

  if (yOnly) return y; // brightness difference only

  const i = rgb2i(r1, g1, b1) - rgb2i(r2, g2, b2);
  const q = rgb2q(r1, g1, b1) - rgb2q(r2, g2, b2);

  const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

  // encode whether the pixel lightens or darkens in the sign
  return y1 > y2 ? -delta : delta;
}

function rgb2y(r, g, b) { return r * 0.29889531 + g * 0.58662247 + b * 0.11448223; }
function rgb2i(r, g, b) { return r * 0.59597799 - g * 0.27417610 - b * 0.32180189; }
function rgb2q(r, g, b) { return r * 0.21147017 - g * 0.52261711 + b * 0.31114694; }

// blend semi-transparent color with white
function blend(c, a) {
  return 255 + (c - 255) * a;
}

function drawPixel(output, pos, r, g, b) {
  output[pos + 0] = r;
  output[pos + 1] = g;
  output[pos + 2] = b;
  output[pos + 3] = 255;
}

function drawGrayPixel(img, i, alpha, output) {
  const r = img[i + 0];
  const g = img[i + 1];
  const b = img[i + 2];
  const val = blend(rgb2y(r, g, b), alpha * img[i + 3] / 255);
  drawPixel(output, i, val, val, val);
}
//Pixel Match

document.addEventListener("DOMContentLoaded", function() {
  var captureButton = document.getElementById("captureButton");
  captureButton.addEventListener("click", startScreenshotInterval);
});

var screenshotInterval;

function startScreenshotInterval() {
  captureScreenshot();
  // Capture screenshots every 5 seconds
  screenshotInterval = setInterval(captureScreenshot, 3000);
}

function captureScreenshot() {
  chrome.tabs.captureVisibleTab(null, { format: "png" }, function (dataUrl) {
    var image = new Image();

    image.onload = function() {
      // Define the coordinates and dimensions of the cropping area "I" in IPL logo.
      var cropX = 170;     // X-coordinate of the top-left corner of the cropping area
      var cropY = 110;     // Y-coordinate of the top-left corner of the cropping area
      var cropWidth = 6; // Width of the cropping area
      var cropHeight = 31; // Height of the cropping area

      var tempCanvas = document.createElement("canvas");
      var tempContext = tempCanvas.getContext("2d");
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;

      tempContext.drawImage(image, 0, 0);

      var croppedDataUrl = cropScreenshot(tempCanvas, cropX, cropY, cropWidth, cropHeight);
      // Compare pixels and mute audio
      compareScreenshot(croppedDataUrl);
      
      
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

  canvas.width = width;
  canvas.height = height;

  // Draw the cropped area onto the canvas
  context.drawImage(image, x, y, width, height, 0, 0, width, height);

  // Return the cropped image data URL
  return canvas.toDataURL("image/png");
}

function compareScreenshot(screenshotDataUrl) {
  // Load the reference image(located in assets) which has a fullscreen screenshot that was taken earlier.
  var referenceImage = new Image();
  referenceImage.src = chrome.runtime.getURL("assets/demo1.png");

  referenceImage.onload = function () {
    
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("2d");

    // Set canvas dimensions to match the reference image
    canvas.width = 6;
    canvas.height = 31;

    // Draw the reference image onto the canvas
    context.drawImage(referenceImage, 170, 110, 6, 31, 0, 0, 6, 31);
   // showScreenshot(canvas.toDataURL("image/png"));
  
    var referenceImageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Get the pixel data for the captured screenshot
    var screenshotImage = new Image();
    screenshotImage.src = screenshotDataUrl;

    screenshotImage.onload = function () {
      // Create a temporary canvas to draw the captured screenshot
      var screenshotCanvas = document.createElement("canvas");
      var screenshotContext = screenshotCanvas.getContext("2d");

      
      screenshotCanvas.width = screenshotImage.width;
      screenshotCanvas.height = screenshotImage.height;

      
      screenshotContext.drawImage(screenshotImage, 0, 0);

      // Get the pixel data for the captured screenshot
      var screenshotImageData = screenshotContext.getImageData(0, 0, screenshotCanvas.width, screenshotCanvas.height);

      // Compare pixels
      var pixelsMatch = comparePixels(referenceImageData, screenshotImageData);
      console.log(pixelsMatch)
     
      if (pixelsMatch) 
        // Pixels match, unmute tab audio
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          chrome.tabs.update(tabs[0].id, { muted: false });
        });
       else 
        // Pixels don't match, mute tab audio
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          chrome.tabs.update(tabs[0].id, { muted: true });
        });
    };
  };
}

function comparePixels(referenceImageData, screenshotImageData) {
  
  const img1 = referenceImageData
  const img2 = screenshotImageData


  const n = pixelmatch(img1.data, img2.data, 0, 6, 31, {threshold: 0.1});

  console.log(n)
  if(n<=15)
    return true;
  return false;
}
