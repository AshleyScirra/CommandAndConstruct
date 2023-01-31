
import * as MathUtils from "../utils/clientMathUtils.js";

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
		
		// Set the base movement cost to 100, rather than the default 10. This allows finer
		// control over the path costs for spreading with path groups.
		this.#pathfindingBeh.map.moveCost = 100;
		
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
			const nodeList = [...this.#pathfindingBeh.nodes()];
			
			// For testing purposes: visualize the path on the DebugOverlay layer.
			this.#DebugVisualizePath(fromX, fromY, nodeList);
			
			return nodeList;
		}
		else
		{
			return null;
		}
	}
	
	// Create PFNode and PFNodeLine objects on the DebugOverlay layer to visualize calculated paths.
	// The objects have the Fade behavior so after a while they fade out and disappear.
	#DebugVisualizePath(fromX, fromY, nodeList)
	{
		// Copy the node list and add the start position at the beginning as an extra node,
		// so the start position is included in the visualization.
		nodeList = nodeList.slice(0);
		nodeList.unshift([fromX, fromY]);
		
		// For every node in the path
		for (let i = 0, len = nodeList.length; i < len; ++i)
		{
			// Get current node position
			const [x, y] = nodeList[i];
			
			// If this is not the last node in the list, then create a line to the next node
			if (i < len - 1)
			{
				// Get next node position
				const [nextX, nextY] = nodeList[i + 1];
				
				// Create a PFNodeLine (Tiled Background) instance. Set its angle to the next node
				// and its width to the distance to the next node, so it acts as a line between them.
				const lineInst = this.#runtime.objects.PFNodeLine.createInstance("DebugOverlay", x, y);
				lineInst.angle = MathUtils.AngleTo(x, y, nextX, nextY);
				lineInst.width = MathUtils.DistanceTo(x, y, nextX, nextY);
			}
			
			// Create a PFNode sprite to represent this node.
			this.#runtime.objects.PFNode.createInstance("DebugOverlay", x, y);
		}
	}
	
	// Forward calls to start and end pathfinding groups to the Pathfinding behavior.
	StartGroup(baseCost, cellSpread, maxWorkers)
	{
		this.#pathfindingBeh.map.startPathGroup(baseCost, cellSpread, maxWorkers);
	}
	
	EndGroup()
	{
		this.#pathfindingBeh.map.endPathGroup();
	}
}