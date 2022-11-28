
// A basic way to detect mobile devices: check user agent string for
// strings indicating iOS or Android. Note this doesn't detect modern iPads,
// because they pretend to be macOS in their user agent string!
const isMobile = /ipod|ipad|iphone|android/i.test(navigator.userAgent);

// The minimap size is determined by a maximum area. This allows the minimap to
// expand wider if the layout is much wider than it is tall, for example.
// On mobile the minimap area is based on 300x300 to make it larger on a small
// screen; on desktop it uses 200x200 since it's easier to see there.
const MINIMAP_AREA = isMobile ? 300 * 300 : 200 * 200;

// The Minimap class manages rendering the game state to a minimap via a DrawingCanvas
// object (MinimapCanvas) on the UI layer.
export class Minimap {

	#gameClient;				// reference to GameClient
	#inst;						// the MinimapCanvas instance
	#deviceScale = 1;			// the DrawingCanvas scale of device pixels per object pixel
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Get the MinimapCanvas instance
		const runtime = this.#gameClient.GetRuntime();
		this.#inst = runtime.objects.MinimapCanvas.getFirstInstance();
	}
	
	// On startup, when the layout size is set, adjust the minimap size according to
	// the aspect ratio of the level and the allowed minimap area.
	SetLayoutSize(layoutWidth, layoutHeight)
	{
		const aspectRatio = layoutWidth / layoutHeight;
		const minimapWidth = Math.sqrt(aspectRatio * MINIMAP_AREA);
		const minimapHeight = minimapWidth / aspectRatio;
		
		this.#inst.width = minimapWidth;
		this.#inst.height = minimapHeight;
	}
	
	// Called every tick to redraw the minimap.
	Update()
	{
		// Save the device scale, i.e. the number of device pixels per object pixel.
		// This is used for snapping co-ordinates to device pixels for precise drawing.
		this.#deviceScale = this.#inst.surfaceDeviceWidth / this.#inst.width;
		
		// Clear the minimap to a grey color.
		this.#inst.clearCanvas([0.2, 0.2, 0.2]);
		
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
				this.#FillRect(x - size / 2, y - size / 2, size, size, playerColor);
			}
		}
		
		// Draw small dots for all projectiles in the game, so combat action is visible
		// on the minimap. Projectiles are drawn yellow, and are sized to 1px on the minimap.
		const projectileColor = [1, 1, 0];
		
		for (const projectile of this.#gameClient.allProjectiles())
		{
			let [x, y] = projectile.GetPosition();
			[x, y] = this.#GameToMinimap(x, y);
			this.#FillRect(x - 0.5, y - 0.5, 1, 1, projectileColor);
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
			this.#FillRect(left, top, width, height, [0, 1, 0, 0.05]);
			this.#OutlineRect(left, top, width, height, [0, 1, 0, 0.5], 1);
		}
		
		// Draw the mouse as a white dot on the minimap too.
		// Note if the player is only using touch input, the mouse position will remain at
		// (0, 0), so only draw the mouse position if it has moved from there.
		let [mouseX, mouseY] = this.#gameClient.GetPointerManager().GetMousePositionInLayout();
		if (mouseX !== 0 || mouseY !== 0)
		{
			[mouseX, mouseY] = this.#GameToMinimap(mouseX, mouseY);
			this.#FillRect(mouseX - 1.5, mouseY - 1.5, 3, 3, [1, 1, 1, 1]);
		}
		
		// Finally, draw the current viewport area as a yellow box.
		// First get the viewport area in minimap co-ordinates.
		const viewManager = this.#gameClient.GetViewManager();
		let [scrollX, scrollY] = viewManager.GetScrollPosition();
		let [viewWidth, viewHeight] = viewManager.GetScaledViewportSize();
		[scrollX, scrollY] = this.#GameToMinimap(scrollX, scrollY);
		[viewWidth, viewHeight] = this.#GameToMinimap(viewWidth, viewHeight);
		
		// Then draw the viewport area as a faint yellow fill with a yellow outline.
		this.#FillRect(scrollX - viewWidth / 2, scrollY - viewHeight / 2,
						viewWidth, viewHeight, [1, 1, 0, 0.05]);
		this.#OutlineRect(scrollX - viewWidth / 2, scrollY - viewHeight / 2,
						viewWidth, viewHeight, [1, 1, 0, 1], 1);
	}
	
	// Convert layout co-ordinates to minimap co-ordinates, by scaling the position
	// to fit within the minimap size.
	#GameToMinimap(x, y)
	{
		const [layoutWidth, layoutHeight] = this.#gameClient.GetViewManager().GetLayoutSize();
		return [x * this.#inst.width / layoutWidth, y * this.#inst.height / layoutHeight];
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
	#FillRect(left, top, width, height, color)
	{
		[left, top, width, height] = this.#SnapRectangleToDevicePixels(left, top, width, height);
		
		this.#inst.fillRect(left, top, left + width, top + height, color);
	}
	
	// Implement an outline as a series of filled rectangles instead.
	// Drawing Canvas has an outlineRect method, but this way we can use the device pixel
	// snapping on all four sides of the rectangle, which looks better.
	#OutlineRect(left, top, width, height, color, thickness)
	{
		this.#FillRect(left, top, width, thickness, color);
		this.#FillRect(left, top, thickness, height, color);
		this.#FillRect(left + width - thickness, top, thickness, height, color);
		this.#FillRect(left, top + height - thickness, width, thickness, color);
	}
}