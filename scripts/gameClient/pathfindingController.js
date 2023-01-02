
// A class to manage pathfinding. It essentially wraps the Pathfinding behavior in the
// PathfindingController object, so it can use Construct's built-in pathfinding calculations.
export class PathfindingController {

	#gameClient;			// reference to GameClient
	#runtime;				// Construct runtime
	#pathfindingBeh;		// the Pathfinding behavior in the PathfindingController object
	#debugTilemapInst;		// a Tilemap instance for displaying the pathfinding map
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		// Get the PathfindingController instance, and get the Pathfinding behavior from it.
		this.#runtime = this.#gameClient.GetRuntime()
		const pfControllerInst = this.#runtime.objects.PathfindingController.getFirstInstance();
		this.#pathfindingBeh = pfControllerInst.behaviors.Pathfinding;
		
		// Get the debug tilemap for displaying the pathfinding map.
		this.#debugTilemapInst = this.#runtime.objects.PFDebugTilemap.getFirstInstance();
	}
	
	// Called on startup to initialise pathfinding.
	async Init()
	{
		// Regenerate the pathfinding map now the layout size has been updated.
		await this.#pathfindingBeh.map.regenerateMap();
		
		// Display the pathfinding map state in the debug tilemap.
		this.#UpdateDebugTilemap();
	}
	
	#UpdateDebugTilemap()
	{
		// Resize the tilemap to the layout size.
		const layout = this.#runtime.layout;
		this.#debugTilemapInst.width = layout.width;
		this.#debugTilemapInst.height = layout.height;
		
		// For each pathfinding map cell, set tile 0 (a red tile) in the tilemap
		// if that cell counts as an obstacle. This displays obstacles as red areas.
		const pfMap = this.#pathfindingBeh.map;
		const hCells = pfMap.widthInCells;
		const vCells = pfMap.heightInCells;
		for (let y = 0; y < vCells; ++y)
		{
			for (let x = 0; x < hCells; ++x)
			{
				if (pfMap.isCellObstacle(x, y))
				{
					this.#debugTilemapInst.setTileAt(x, y, 0);
				}
			}
		}
	}
	
	// Find a path between two points using the Pathfinding behavior. Return the result
	// as a list of waypoints (i.e. [[x1, y1], [x2, y2], ...]) or null if no path
	// was able to be calculated.
	async FindPath(fromX, fromY, toX, toY)
	{
		const foundPath = await this.#pathfindingBeh.calculatePath(fromX, fromY, toX, toY);
		if (foundPath)
		{
			return [...this.#pathfindingBeh.nodes()];
		}
		else
		{
			return null;
		}
	}
}