import * as PIXI from 'pixi.js';
import { ToClientMsg, ToServerMsg, Box, PartKind } from "./codec";

const pixi = new PIXI.Application({ width: window.innerWidth, height: window.innerHeight, antialias: false, transparent: false, backgroundColor: 0 });
document.body.appendChild(pixi.view);

const scaling = new PIXI.Container();
const world = new PIXI.Container();
scaling.addChild(world);
pixi.stage.addChild(scaling);
let scale_up;
function resize() {
    const window_size = Math.min(window.innerWidth, window.innerHeight);
    pixi.view.width = window.innerWidth;
    pixi.view.height = window.innerHeight;
    pixi.renderer.resize(window.innerWidth, window.innerHeight);
    scale_up = Math.max(window_size * (0.035545023696682464), 30);
    scaling.scale.set(scale_up, scale_up);
}
resize();

let rendering = true;

let spritesheet: PIXI.Spritesheet;
new Promise(async (resolve, reject) => {
    const image_promise: Promise<HTMLImageElement> = new Promise((resolve, reject) => {
        const image = document.createElement("img");
        image.src = "/spritesheet.png";
        image.onload = () => { resolve(image); }
        image.onerror = err => reject(err);
    });
    const dat_promise: Promise<Object> = fetch("/spritesheet.json").then(res => res.json());
    const image = await image_promise;
    const dat = await dat_promise;
    const texture = PIXI.Texture.from(image);
    spritesheet = new PIXI.Spritesheet(texture, dat);
    spritesheet.parse(resolve);
}).then(() => {

    //ws%3A%2F%2Flocalhost%3A8081 for localhost 8081
    const socket = new WebSocket(decodeURIComponent(window.location.hash.slice(1)));
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
        socket.send(new Uint8Array(new ToServerMsg.Handshake("glap.rs-0.1.0", null).serialize()));
    };
    function handshake_ing(e: MessageEvent) {
        const message = ToClientMsg.deserialize(new Uint8Array(e.data), new Box(0));
        if (message instanceof ToClientMsg.HandshakeAccepted) {
            console.log("Handshake Accepted");
            socket.removeEventListener("message", handshake_ing);
            socket.addEventListener("message", on_message);
        } else throw new Error();
    }
    socket.addEventListener("message", handshake_ing);
    socket.onerror = err => { throw err; };

    let my_core: PIXI.Sprite = null;
    const parts = new Map<number, PIXI.Sprite>();
    const celestial_objects = new Map<number, PIXI.Sprite>();

    function on_message(e: MessageEvent) {
        const msg = ToClientMsg.deserialize(new Uint8Array(e.data), new Box(0));

        if (msg instanceof ToClientMsg.AddCelestialObject) {
            const celestial_object = new PIXI.Sprite(spritesheet.textures[msg.name + ".png"]);
            celestial_object.width = msg.radius * 2;
            celestial_object.height = msg.radius * 2;
            celestial_object.position.set(msg.position[0], msg.position[1]);
            world.addChild(celestial_object);
            celestial_objects.set(msg.id, celestial_object);
        }

        else if (msg instanceof ToClientMsg.AddPart) {
            const part = new PIXI.Sprite(spritesheet.textures[PartKind[msg.kind] + ".png"]);
            part.width = 1; part.height = 1;
            world.addChild(part);
            parts.set(msg.id, part);
        }
        else if (msg instanceof ToClientMsg.MovePart) {
            const part = parts.get(msg.id);
            part.position.set(msg.x, msg.y);
            part.rotation = Math.atan2(msg.rotation_i, msg.rotation_n);
        }
    }

    function render() {
        if (rendering) {
            //if (my_core != null) { world.position.set(-my_core.position.x, -my_core.position.y); }
            pixi.render();
            requestAnimationFrame(render);
        }
    }
    requestAnimationFrame(render);
});