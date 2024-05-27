# Realtime 3D fractal explorer

[Check out the demo](https://progressive-renderer.netlify.app/?fractal=klein2)

This is an interactive 3d fractal explorer. The fractals are represented using Signed Distance Functions, and  rendered using a technique called raymarching. The images are rendered using WebGL (through a library called regl).

It looks like this:

![Rendered image](./screencapture.png) 

## Progressive rendering

Rendering complex signed distance functions is computationally expensive. That makes it hard to render them at high resolutions at acceptable framerates. To work around this, this app renders frames progressively: instead of rendering the image at full resolution every frame, it instead renders only part of the frame (i.e. using lower resolution) to ensure things can be rendered at smooth framerates. If the user hasn't updated the camera state (i.e. they haven't moved or panned), the app
continues too render the same image, with slight offsets added to the pixel coordinates. This allows it to then combine multiple slightly offset frames into a single image, all the way until we have an anti-aliased full-resolution version of the frame.
