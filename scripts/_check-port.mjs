import net from "net";
import fs from "fs";
const s = net.connect(3000, "127.0.0.1");
s.on("connect", () => {
console.log("port 3000 OPEN");
s.end();
});
s.on("error", (e) => console.log("port 3000 closed:", e.code));
console.log(fs.existsSync(".next") ? "next dir exists" : "no .next dir");