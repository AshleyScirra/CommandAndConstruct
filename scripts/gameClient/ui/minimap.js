
// A basic way to detect mobile devices: check user agent string for
// strings indicating iOS or Android. Note this doesn't detect modern iPads,
// because they pretend to be macOS in their user agent string!
const isMobile = /ipod|ipad|iphone|android/i.test(navigator.userAgent);

// The minimap size is determined by a maximum area. This allows the minimap to
// expand wider if the layout is much wider than it is tall, for example.
// On mobile the minimap area is based on 300x300 to make it larger on a small
// screen; on desktop it uses 200x200 since it's easier to see there.
const MINIMAP_AREA = isMobile ? 300 * 300 : 200 * 200;

// The minimap is drawn using three DrawingCanvas instances for three "layers" of the minimap.
// Since drawing units is relatively expensive in CPU time, but they don't move quickly on
// the minimap, units are drawn on to a DrawingCanvas that updates at just 20 FPS instead
// of every frame. The difference is hardly noticable and it only uses 1/3 the drawing time.
// Other content, like projectiles and the viewport area, update every frame as they take
// less CPU time to draw and they benefit more from being displayed smoothly.
// (The terrain layer at the back only draws once when the window is resized.)
const SLOW_UPDATE_FPS = 20;

// The Minimap class manages rendering the game state to a minimap via a DrawingCanvas
// object (MinimapCanvas) on the UI layer.
export class Minimap {

	#gameClient;				// reference to GameClient
	#backgroundInst;			// the MinimapBackground instance (TiledBackground)
	#terrainInst;				// the MinimapCanvasTerrain instance (draws once per window size)
	#slowInst;					// the MinimapCanvasSlow instance (draws at a lower FPS)
	#fastInst;					// the MinimapCanvasFast instance (draws at full FPS)
	#deviceScale = 1;			// the DrawingCanvas scale of device pixels per object pixel
	#lastDrawTime = 0;			// for tracking slow update redraws
	
	// Last terrain canvas device size, for tracking when it changes
	#lastTerrainDeviceWidth = 0;
	#lastTerrainDeviceHeight = 0;
	#redrawTerrain = false;		// for forcing terrain to redraw
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Get the background and three minimap DrawingCanvas instances
		const runtime = this.#gameClient.GetRuntime();
		this.#backgroundInst = runtime.objects.MinimapBackground.getFirstInstance();
		this.#terrainInst = runtime.objects.MinimapCanvasTerrain.getFirstInstance();
		this.#slowInst = runtime.objects.MinimapCanvasSlow.getFirstInstance();
		this.#fastInst = runtime.objects.MinimapCanvasFast.getFirstInstance();
	}
	
	// On startup, when the layout size is set, adjust the minimap size according to
	// the aspect ratio of the level and the allowed minimap area.
	SetLayoutSize(layoutWidth, layoutHeight)
	{
		const aspectRatio = layoutWidth / layoutHeight;
		const minimapWidth = Math.sqrt(aspectRatio * MINIMAP_AREA);
		const minimapHeight = minimapWidth / aspectRatio;
		
		this.#backgroundInst.width = minimapWidth;
		this.#backgroundInst.height = minimapHeight;
		this.#terrainInst.width = minimapWidth;
		this.#terrainInst.height = minimapHeight;
		this.#slowInst.width = minimapWidth;
		this.#slowInst.height = minimapHeight;
		this.#fastInst.width = minimapWidth;
		this.#fastInst.height = minimapHeight;
	}
	
	// Called every tick to redraw the minimap.
	Update(gameTime)
	{
		// Save the device scale, i.e. the number of device pixels per object pixel.
		// This is used for snapping co-ordinates to device pixels for precise drawing.
		// (Note both canvas instances are the same size so we only need to use one.)
		this.#deviceScale = this.#slowInst.surfaceDeviceWidth / this.#slowInst.width;
		
		// If the terrain canvas device size has changed due to the window size changing,
		// or the redraw flag is set, redraw the terrain representation on the minimap.
		if (this.#redrawTerrain ||
			this.#terrainInst.surfaceDeviceWidth !== this.#lastTerrainDeviceWidth ||
			this.#terrainInst.surfaceDeviceHeight !== this.#lastTerrainDeviceHeight)
		{
			this.#DrawTerrainCanvas();
			
			this.#redrawTerrain = false;
			this.#lastTerrainDeviceWidth = this.#terrainInst.surfaceDeviceWidth;
			this.#lastTerrainDeviceHeight = this.#terrainInst.surfaceDeviceHeight;
		}
		
		// Draw the slow-update canvas at a lower framerate to reduce its CPU overhead.
		const slowUpdateInterval = 1 / SLOW_UPDATE_FPS;
		if (this.#lastDrawTime <= gameTime - slowUpdateInterval)
		{
			this.#DrawSlowUpdateCanvas();
			this.#lastDrawTime += slowUpdateInterval;
		}
		
		// Draw the fast-update canvas at the full framerate (every tick).
		this.#DrawFastUpdateCanvas();
	}
	
	// When the window is resized, or when the pathfinding map is first generated,
	// clear the terrain canvas to transparent and flag that terrain should be redrawn.
	// The clear forces it to resize its surface in automatic resolution mode so it
	// adapts to a resized window, and setting the flag ensures it redraws even if the
	// resolution has not changed, since in that case the surface device size stays
	// the same. (This is necessary on startup after generating the pathfinding map.)
	UpdateTerrain()
	{
		this.#terrainInst.clearCanvas([0, 0, 0, 0]);
		this.#redrawTerrain = true;
	}
	
	// Draws terrain to the minimap, but only as a one-off on startup or when the
	// window is resized.
	#DrawTerrainCanvas()
	{
		// Get the pathfinding controller, which has the obstacle map, the
		// current layout size, and the terrain canvas device size.
		const pathfindingController = this.#gameClient.GetPathfindingController();
		const [layoutWidth, layoutHeight] = this.#gameClient.GetViewManager().GetLayoutSize();
		const deviceWidth = this.#terrainInst.surfaceDeviceWidth;
		const deviceHeight = this.#terrainInst.surfaceDeviceHeight;
		
		// Draw terrain by directly generating an ImageData with pixel data.
		// Create it at the size matching the surface device size.
		const imageData = new ImageData(deviceWidth, deviceHeight);
		
		// For convenience, update the pixel data with a Uint32Array instead
		// of the default Uint8ClampedArray. This means each pixel is a single
		// element in the array.
		const u32arr = new Uint32Array(imageData.data.buffer);
		
		// For each device pixel in the ImageData
		for (let y = 0; y < deviceHeight; ++y)
		{
			// Calculate the layout Y co-ordinate for this device pixel Y
			const layoutY = y * layoutHeight / deviceHeight;
			
			for (let x = 0; x < deviceWidth; ++x)
			{
				// Calculate the layout X co-ordinate for this device pixel X
				const layoutX = x * layoutWidth / deviceWidth;
				
				// Check if this pixel is an obstacle via PathfindingController.
				// If it is, write an opaque grey pixel in to the ImageData.
				if (pathfindingController.IsCellObstacle(layoutX, layoutY))
				{
					const index = y * deviceWidth + x;
					u32arr[index] = 0xFF505050;		// hex in ARGB order
				}
			}
		}
		
		// Now the pixel data has been generated, load it in to the terrain canvas.
		this.#terrainInst.loadImagePixelData(imageData);
	}
	
	// Draw the bottom DrawingCanvas of the minimap, updating at a lower framerate to save CPU time.
	#DrawSlowUpdateCanvas()
	{	
		// Clear to fully transparent.
		this.#slowInst.clearCanvas([0, 0, 0, 0]);
		
		// Draw move markers to the minimap as 1px size green dots, so the scheduled movements
		// of units can be seen.
		const runtime = this.#gameClient.GetRuntime();
		for (const moveMarkerInst of runtime.objects.MoveMarker.instances())
		{
			let [x, y] = moveMarkerInst.getPosition();
			[x, y] = this.#GameToMinimap(x, y);
			this.#FillRect(this.#slowInst, x - 0.5, y - 0.5, 1, 1, [0, 0.67, 0]);
		}
		
		// Draw small colored rectangles for each player's units.
		// TODO: have some centralized way to store players and their colors
		for (let player = 0; player < 2; player++)
		{
			// Hacky way to set the player dot colors for now.
			const playerColor = (player === 0 ? [0.5, 0.5, 1] : [1, 0.5, 0.5]);
			
			// Draw a dot for every unit for this player.
			for (const unit of this.#gameClient.allUnitsForPlayer(player))
			{
				// Get the unit position, and convert to minimap co-ordinates.
				const platform = unit.GetPlatform();
				let [x, y] = platform.GetPosition();
				[x, y] = this.#GameToMinimap(x, y);
				
				// Get the unit size and convert that to minimap co-ordinates.
				// The rectangle size for the unit is the smallest of the width and height,
				// but is at least 2 pixels on the minimap. This allows the dots to increase
				// in size proportionally with the unit for smaller maps.
				let [w, h] = platform.GetSize();
				[w, h] = this.#GameToMinimap(w, h);
				const size = Math.max(Math.min(w, h), 2);
				
				// Fill a small rectangle for this unit.
				this.#FillRect(this.#slowInst, x - size / 2, y - size / 2, size, size, playerColor);
			}
		}
	}
	
	// Draw the top DrawingCanvas of the minimap, updating at a full framerate for smoothness.
	#DrawFastUpdateCanvas()
	{
		// Clear to fully transparent.
		this.#fastInst.clearCanvas([0, 0, 0, 0]);
		
		// Draw small dots for all projectiles in the game, so combat action is visible
		// on the minimap. Projectiles are drawn yellow, and are sized to 1px on the minimap.
		const projectileColor = [1, 1, 0];
		
		for (const projectile of this.#gameClient.allProjectiles())
		{
			let [x, y] = projectile.GetPosition();
			[x, y] = this.#GameToMinimap(x, y);
			this.#FillRect(this.#fastInst, x - 0.5, y - 0.5, 1, 1, projectileColor);
		}
		
		// Draw selection boxes on the minimap too. Iterate any active pointers being used
		// for dragging a selection box, and convert the selection box area to minimap co-ordinates.
		for (const dragPointer of this.#gameClient.GetPointerManager().dragPointers())
		{
			let [left, top, width, height] = dragPointer.GetSelectionBoxArea();
			[left, top] = this.#GameToMinimap(left, top);
			[width, height] = this.#GameToMinimap(width, height);
			
			// Fill a faint green color and then use a reduced-opacity green outline
			// to reduce the contrast.
			this.#FillRect(this.#fastInst, left, top, width, height, [0, 1, 0, 0.05]);
			this.#OutlineRect(this.#fastInst, left, top, width, height, [0, 1, 0, 0.5], 1);
		}
		
		// Draw the mouse as a white dot on the minimap too.
		// Note if the player is only using touch input, the mouse position will be returned as
		// NaN, so don't draw the mouse on the minimap in that case.
		let [mouseX, mouseY] = this.#gameClient.GetPointerManager().GetMousePositionInLayout();
		if (!Number.isNaN(mouseX) && !Number.isNaN(mouseY))
		{
			[mouseX, mouseY] = this.#GameToMinimap(mouseX, mouseY);
			this.#FillRect(this.#fastInst, mouseX - 1.5, mouseY - 1.5, 3, 3, [1, 1, 1, 1]);
		}
		
		// Finally, draw the current viewport area as a yellow box.
		// First get the viewport area in minimap co-ordinates.
		const viewManager = this.#gameClient.GetViewManager();
		let [scrollX, scrollY] = viewManager.GetScrollPosition();
		let [viewWidth, viewHeight] = viewManager.GetScaledViewportSize();
		[scrollX, scrollY] = this.#GameToMinimap(scrollX, scrollY);
		[viewWidth, viewHeight] = this.#GameToMinimap(viewWidth, viewHeight);
		
		// Then draw the viewport area as a faint yellow fill with a yellow outline.
		this.#FillRect(this.#fastInst, scrollX - viewWidth / 2, scrollY - viewHeight / 2,
						viewWidth, viewHeight, [1, 1, 0, 0.05]);
		this.#OutlineRect(this.#fastInst, scrollX - viewWidth / 2, scrollY - viewHeight / 2,
						viewWidth, viewHeight, [1, 1, 0, 1], 1);
	}
	
	// Convert layout co-ordinates to minimap co-ordinates, by scaling the position
	// to fit within the minimap size.
	#GameToMinimap(x, y)
	{
		const [layoutWidth, layoutHeight] = this.#gameClient.GetViewManager().GetLayoutSize();
		return [x * this.#slowInst.width / layoutWidth, y * this.#slowInst.height / layoutHeight];
	}
	
	// Due to window scaling and high-density displays, the minimap canvas may have more (or less)
	// physical (aka device) pixels than the object size. For example there could be 1.5 device pixels
	// per object pixel. This means drawing 3px size rectangles in different places can look
	// inconsistent as they all round differently and end up slightly different sizes.
	// To avoid this, the drawn positions are snapped to device pixels, and then converted back to
	// object co-ordinates for drawing, since drawing commands are in object co-ordinates; when they
	// are really drawn, they will consistently line up with device pixels which looks better.
	#SnapRectangleToDevicePixels(left, top, width, height)
	{
		const deviceScale = this.#deviceScale;
		
		// Convert all values to device pixels, and then round them.
		// Note the size also uses a minimum of 1 device pixel, since otherwise smaller sizes
		// may completely disappear.
		const deviceLeft = Math.round(left * deviceScale);
		const deviceTop = Math.round(top * deviceScale);
		const deviceWidth = Math.max(Math.round(width * deviceScale), 1);
		const deviceHeight = Math.max(Math.round(height * deviceScale), 1);
		
		// Return converted back to object co-ordinates.
		return [deviceLeft / deviceScale, deviceTop / deviceScale,
				deviceWidth / deviceScale, deviceHeight / deviceScale];
	}
	
	// Fill a rectangle with a color, but snap the given position to device co-ordinates
	// for better rendering.
	#FillRect(inst, left, top, width, height, color)
	{
		[left, top, width, height] = this.#SnapRectangleToDevicePixels(left, top, width, height);
		
		inst.fillRect(left, top, left + width, top + height, color);
	}
	
	// Implement an outline as a series of filled rectangles instead.
	// Drawing Canvas has an outlineRect method, but this way we can use the device pixel
	// snapping on all four sides of the rectangle, which looks better.
	#OutlineRect(inst, left, top, width, height, color, thickness)
	{
		this.#FillRect(inst, left, top, width, thickness, color);
		this.#FillRect(inst, left, top, thickness, height, color);
		this.#FillRect(inst, left + width - thickness, top, thickness, height, color);
		this.#FillRect(inst, left, top + height - thickness, width, thickness, color);
	}
}