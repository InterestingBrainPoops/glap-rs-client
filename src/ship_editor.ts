import * as PIXI from "pixi.js";
import { PartKind } from "./codec";
import { parse as qs_parse } from "query-string";
import { RecursivePart } from "./ship_editor_parts";
import { validate as lib_uuid_validate } from "uuid";

export const params = window.location.href.indexOf("?") > -1 ? qs_parse(window.location.href.substr(window.location.href.indexOf("?") + 1)) : {};
console.log("RE");
console.log(params);
export const never_promise = new Promise(() => {});

let session: string = null; 
if ("localStorage" in window) session = window.localStorage.getItem("session");
const has_session = session !== null && lib_uuid_validate(session);
console.log("Has session: " + has_session);

export interface GlobalData {
	scaling: PIXI.Container;
	world: PIXI.Container;
	spritesheet: PIXI.Spritesheet;

	sidebar: PIXI.Container;
	pane_background: PIXI.Graphics;
	pane_border: PIXI.TilingSprite;

	pane_size: number;
	zoom: number;
	raw_scale_up: number;
	scale_up: number;

	save_data_provider: SaveDataProvider;
	total_inventory: Map<PartKind, number>;
	local_inventory: Map<PartKind, Box<number>>;
	layout: RecursivePart;
	dangling_pieces: RecursivePart[];
}

export const global: GlobalData = {
	scaling: new PIXI.Container(),
	world: new PIXI.Container(),
	spritesheet: null,

	sidebar: new PIXI.Container(),
	pane_background: new PIXI.Graphics().beginFill(0xaba9b7).drawRect(0,0,1,1).endFill(),
	pane_border: null,

	pane_size: 0,
	zoom: 1,
	raw_scale_up: 0,
	scale_up: 0,

	save_data_provider: null,
	total_inventory: new Map(),
	local_inventory: new Map(),
	layout: null,
	dangling_pieces: [],
};
(window as any)["global"] = global;

export interface SaveDataProvider {
	set_session(session: string): Promise<void>;
	get_slots(): Promise<SaveDataSlot[]>;
	get_current_layout(): Promise<SaveDataProviderRecursivePartDescription>;
	set_current_layout(layout: SaveDataProviderRecursivePartDescription): Promise<void>;
	get_slot_layout(slot: string): Promise<SaveDataProviderRecursivePartDescription>;
	set_slot_layout(slot: string, layout: SaveDataProviderRecursivePartDescription): Promise<void>;
	get_inventory(): Promise<{ [key: number]: number }>;
}
export interface SaveDataSlot {
	id: string;
	display_name: string;
}
export interface SaveDataProviderRecursivePartDescription {
	kind: PartKind;
	attachments: SaveDataProviderRecursivePartDescription[];
}

const app = new PIXI.Application({ autoStart: false, width: window.innerWidth, height: window.innerHeight, antialias: true, });
document.body.appendChild(app.view);

const blueprint = new PIXI.TilingSprite(PIXI.Texture.from("./blueprint.png"), 150, 150);
blueprint.anchor.set(0.5,0.5);

app.stage.addChild(global.scaling);
global.scaling.addChild(blueprint);
global.scaling.addChild(global.world);

app.stage.addChild(global.sidebar);
global.sidebar.addChild(global.pane_background);

if (typeof params["save_data_provider"] !== "string") { alert("Invalid save data provider url"); throw new Error("Invalid save data provider url"); }
const save_data_provider_url = params["save_data_provider"] as string;
const save_data_provider_is_module = "save_data_provider_is_module" in params ? params["save_data_provider_is_module"] == "true" : false;
if (typeof params["spritesheet"] !== "string") { alert("Invalid spritesheet url"); throw new Error("Invalid spritesheet url"); }
const spritesheet_url_base = params["spritesheet"] as string;

export function resize() {
    const window_size = Math.min(window.innerWidth, window.innerHeight);
	app.view.width = window.innerWidth;
	app.view.height = window.innerHeight;
    app.renderer.resize(window.innerWidth, window.innerHeight);
	global.pane_size = Math.max(window.innerWidth * 0.07, 100);
	const pane_border_size = global.pane_size * 0.1;
    global.scaling.position.set(app.view.width / 2 + global.pane_size + pane_border_size, app.view.height / 2);
    global.raw_scale_up = Math.max(window_size * (0.045545023696682464), 30);
    global.scale_up = global.raw_scale_up * global.zoom;
    global.scaling.scale.set(global.scale_up, global.scale_up);

	blueprint.tileScale.set(2 / global.scale_up);
	global.pane_background.width = global.pane_size;
	global.pane_background.height = window.innerHeight;
	global.pane_border.height = pane_border_size;
	global.pane_border.width = window.innerHeight;
	global.pane_border.x = global.pane_size;
	global.pane_border.tileScale.y = 2 / pane_border_size;
	global.pane_border.tileScale.x = global.pane_border.tileScale.y / global.pane_border.texture.height * global.pane_border.texture.width;
}

const save_data_provider = new Promise((resolve, reject) => {
	(window as any).save_data_provider_hooks = [resolve, reject];
	const script_el = document.createElement("script");
	script_el.setAttribute("src", save_data_provider_url);
	if (save_data_provider_is_module) script_el.setAttribute("type", "module");
	script_el.setAttribute("async", "");
	script_el.addEventListener("error", e => reject(e));
	document.head.appendChild(script_el);
});

let spritesheet: PIXI.Spritesheet = null;
new Promise(async (resolve, _reject) => {
    const image_promise: Promise<HTMLImageElement> = new Promise((resolve, reject) => {
        const image = document.createElement("img");
        image.src = `${spritesheet_url_base}.png`;
        image.onload = () => { resolve(image); }
        image.onerror = err => reject(err);
    });
    const dat_promise: Promise<Object> = fetch(`${spritesheet_url_base}.json`).then(res => res.json());
    const image = await image_promise;
    const dat = await dat_promise;
    const texture = PIXI.Texture.from(image);
    spritesheet = new PIXI.Spritesheet(texture, dat);
	global.spritesheet = spritesheet;
    spritesheet.parse(resolve);
}).then(() => save_data_provider)
.then(async (save_data_provider: SaveDataProvider) => {
	global.save_data_provider = save_data_provider;

	await save_data_provider.set_session(session);
	const inventory = await save_data_provider.get_inventory();
	for (const key in inventory) {
		const part_kind = parseInt(key);
		global.total_inventory.set(part_kind, inventory[part_kind]);
	}

	global.layout = RecursivePart.inflate(await save_data_provider.get_current_layout());

}).catch(err => { alert("Failed to load save data"); console.error(err); return never_promise; })
.then(() => {
	global.pane_border = new PIXI.TilingSprite(global.spritesheet.textures["tiling_caution_border.png"], 1, 1);
	global.sidebar.addChild(global.pane_border);
	global.pane_border.rotation = Math.PI / 2;

	reset_local_inventory();
	inventory_take_parts(global.layout, true);
	global.world.addChild(global.layout.container);

	resize();
	window.addEventListener("resize", resize);
	
	function render() {
		app.render();	
		requestAnimationFrame(render);
	}
	requestAnimationFrame(render);
});

function reset_local_inventory() {
	global.local_inventory.clear();
	for (const [kind, count] of global.total_inventory) {
		global.local_inventory.set(kind, new Box(count));
	}

}
function inventory_take_parts(parts: RecursivePart, recurse: boolean) {
	function do_recurse(part: RecursivePart) {
		if (!global.local_inventory.has(part.kind)) global.local_inventory.set(part.kind, new Box(0));
		global.local_inventory.get(part.kind).v -= 1;
		if (recurse) {
			for (const attachment of part.attachments) {
				if (attachment != null) do_recurse(attachment);
			}
		}
	}
	do_recurse(parts);
	//TODO update inventory text
}
function inventory_return_parts(parts: RecursivePart, recurse: boolean) {
	function do_recurse(part: RecursivePart) {
		const inv = global.local_inventory.get(part.kind);
		if (inv != null) inv.v += 1;
		if (recurse) {
			for (const attachment of part.attachments) {
				if (attachment != null) do_recurse(attachment);
			}
		}
	}
	do_recurse(parts);
	//TODO update inventory text
}

export class Box<T> { v: T; constructor(v: T) { this.v = v; } }
