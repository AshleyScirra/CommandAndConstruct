
import * as MathUtils from "../utils/clientMathUtils.js";

// ViewManager handles the game view, including the scroll position and zoom level.
export class ViewManager {

	#gameClient;					// Reference to GameClient
	
	// For pan-scrolling, the last client position of the pan position.
	// These values start as NaN for the first update but are then the last client position.
	#panLastClientX = NaN;
	#panLastClientY = NaN;
	
	#zoom = 1;						// Current zoom scale, e.g. 0.5 for zoomed out to 50%
	#targetZoom = 1;				// Target zoom scale for smooth zoom
	#zoomToX = 0;					// Position to zoom to or from
	#zoomToY = 0;
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Reset the scroll and zoom to replace any prior state from the last game
		this.#SetActualZoom(1, true /* force */);
		
		const [viewportWidth, viewportHeight] = this.GetViewportSize();
		this.ScrollTo(viewportWidth / 2, viewportHeight / 2);
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	GetPointerManager()
	{
		return this.#gameClient.GetPointerManager();
	}
	
	// Called during initialisation to set the size of the level.
	SetLayoutSize(layoutWidth, layoutHeight)
	{
		// Set the layout size
		const runtime = this.GetRuntime();
		const layout = runtime.layout;
		layout.width = layoutWidth;
		layout.height = layoutHeight;
		
		// Resize the background to cover the layout
		const backgroundInst = runtime.objects.DirtTerrainBackground.getFirstInstance();
		backgroundInst.width = layoutWidth;
		backgroundInst.height = layoutHeight;
		
		// Update minimap to use this size
		this.#gameClient.GetMinimap().SetLayoutSize(layoutWidth, layoutHeight);
		
		// Start zoomed out all the way and center the scroll position
		this.#SetActualZoom(this.#GetMinZoom(), true /* force */);
		this.ScrollTo(layoutWidth / 2, layoutHeight / 2);
	}
	
	// Called when starting a pan, either by middle mouse button or a pinch-to-zoom gesture.
	StartPan()
	{
		// Reset the last pan client position to NaN so the next call to UpdatePan()
		// knows it's the first update since the pan started.
		this.#panLastClientX = NaN;
		this.#panLastClientY = NaN;
	}
	
	// Called when the pan position moves during a middle-mouse or touch pan.
	// It passes the current position in client co-ordinates, and uses the difference from
	// the last pan client position to determine how far to scroll.
	UpdatePan(clientX, clientY)
	{
		// The first time this method is called the last client pan position is NaN.
		// In that case don't attempt to scroll, as we don't know what the difference is
		// from the last position yet.
		if (!isNaN(this.#panLastClientX) && !isNaN(this.#panLastClientY))
		{
			// Identify the distance moved in client co-ordinates.
			const clientDx = clientX - this.#panLastClientX;
			const clientDy = clientY - this.#panLastClientY;
			
			// To find how far the given distance in client co-ordinates is on the background layer,
			// find both (0, 0) and this position in layer co-ordinates, and use the distance between
			// those points. Use that to offset the scroll position.
			const layout = this.GetRuntime().layout;
			const backgroundLayer = layout.getLayer("Background");
			const [ax, ay] = backgroundLayer.cssPxToLayer(0, 0);
			const [bx, by] = backgroundLayer.cssPxToLayer(clientDx, clientDy);
			this.ScrollTo(layout.scrollX + (ax - bx), layout.scrollY + (ay - by));
		}
		
		// Save the last client pan position for the next call.
		this.#panLastClientX = clientX;
		this.#panLastClientY = clientY;
	}
	
	// Scroll to the given position, but apply scroll bounding so the player can't move the
	// view past the edges of the layout.
	ScrollTo(x, y)
	{
		// Calculate how large the viewport is at this zoom level and use half that
		// size as a margin around the edge of the layout.
		const [layoutWidth, layoutHeight] = this.GetLayoutSize();
		const [scaledViewportWidth, scaledViewportHeight] = this.GetScaledViewportSize();
		const hbound = scaledViewportWidth / 2;
		const vbound = scaledViewportHeight / 2;
		
		// Scroll to the given position, but limited to the scroll boundaries.
		this.GetRuntime().layout.scrollTo(
			MathUtils.Clamp(x, hbound, layoutWidth - hbound),
			MathUtils.Clamp(y, vbound, layoutHeight - vbound)
		);
	}
	
	// Get the current scroll position, where the view is centered on.
	GetScrollPosition()
	{
		const layout = this.GetRuntime().layout;
		return [layout.scrollX, layout.scrollY];
	}
	
	GetViewportSize()
	{
		const runtime = this.GetRuntime();
		return [runtime.viewportWidth, runtime.viewportHeight];
	}
	
	GetScaledViewportSize()
	{
		const [vw, vh] = this.GetViewportSize();
		return [vw / this.#zoom, vh / this.#zoom];
	}
	
	GetLayoutSize()
	{
		const runtime = this.GetRuntime();
		return [runtime.layout.width, runtime.layout.height];
	}
	
	// Get the minimum zoom value allowed (i.e. the furthest the player can zoom out).
	// This is whatever zoom level is hit first: the viewport width equalling the width
	// of the layout, or the viewport height equalling the height of the layout.
	#GetMinZoom()
	{
		const [viewportWidth, viewportHeight] = this.GetViewportSize();
		const [layoutWidth, layoutHeight] = this.GetLayoutSize();
		return Math.max(viewportWidth / layoutWidth, viewportHeight / layoutHeight);
	}
	
	SetZoomToPosition(zoomToX, zoomToY)
	{
		this.#zoomToX = zoomToX;
		this.#zoomToY = zoomToY;
	}
	
	// Set the view to a given zoom level.
	SetZoom(z)
	{
		// Limit the provided zoom level to the allowed range (with 2x zoomed in the maximum allowed).
		// Note this only sets the target zoom level. To smooth out zooms, the actual zoom level
		// is adjusted over time towards the target zoom level.
		this.#targetZoom = MathUtils.Clamp(z, this.#GetMinZoom(), 2);
	}
	
	// Return the zoom. This returns the target zoom level, ignoring the zoom animation effect.
	GetZoom()
	{
		return this.#targetZoom;
	}
	
	// When ticking, smoothly move the actual zoom level towards the target zoom level.
	Tick(dt)
	{
		// Once within 0.01% of the target zoom level, just jump to the target zoom level.
		if (Math.abs(this.#targetZoom - this.#zoom) < this.#targetZoom * 0.0001)
		{
			this.#SetActualZoom(this.#targetZoom);
		}
		else
		{
			// Smoothly adjust the zoom level towards the target zoom level at a rate of 99.99% per second.
			// The maths for this, in the form lerp(a, b, 1 - f ^ dt) is explained in this blog post:
			// https://www.construct.net/en/blogs/ashleys-blog-2/using-lerp-delta-time-924
			this.#SetActualZoom(MathUtils.lerp(this.#zoom, this.#targetZoom, 1 - Math.pow(0.0001, dt)));
		}
	}
	
	#SetActualZoom(z, force = false)
	{
		// Forcing the zoom is used on startup to assign the zoom level with no animation.
		if (force)
			this.#targetZoom = z;
		else if (this.#zoom === z)
			return;		// no change
		
		const lastZoom = this.#zoom;		// save the last zoom value for zoom-to-position calculation
		this.#zoom = z;
		
		// Get the zoom position (from which to zoom in to/out from) on the background layer.
		const layout = this.GetRuntime().layout;
		const backgroundLayer = layout.getLayer("Background");
		const [zoomToX, zoomToY] = backgroundLayer.cssPxToLayer(this.#zoomToX, this.#zoomToY);
		
		// Adjust the scroll position to ensure the zoom happens towards the given position.
		const zoomFactor = 1 - (lastZoom / this.#zoom);
		const dx = zoomToX - layout.scrollX;
		const dy = zoomToY - layout.scrollY;
		this.ScrollTo(layout.scrollX + dx * zoomFactor,
					  layout.scrollY + dy * zoomFactor);
		
		// Update all "Game" sub-layers to scale according to the zoom value.
		const gameLayer = layout.getLayer("Game");
		for (const layer of gameLayer.allSubLayers())
		{
			layer.scale = this.#zoom;
		}
		
		// Now the zoom level has changed, the layer positions of pointers will have changed.
		// Update all pointers, which acts the same as a pointermove but using the last
		// client position. This helps keep selection boxes in place while zooming.
		this.GetPointerManager().UpdateAllPointers();
	}
}