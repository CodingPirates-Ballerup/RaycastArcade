const textures = [
    assets.image`pirate`,          // map color 1
    assets.image`wood`,            // map color 2
    assets.image`wood`,            // map color 3
    assets.image`brick`,           // map color 4
    assets.image`pirate`,          // map color 5
    assets.image`stone`,           // map color 6
    assets.image`wood`,            // map color 7
]

const numTexture = textures.length;

const animTextures = [
    assets.animation`myAnim`,      // map color 8
]


game.stats = true
const fpx = 10 // Fixed point position (10 bit)
const fpx_scale = 1 << fpx // Fixed point scaling (2^fpx)
const one_fp = 1 << fpx // One unit in fixed point.
const one2 = 1 << (fpx + fpx)
// Convert from integer to fixed point number
function tofpx(n: number) {
    return (n * fpx_scale) | 0
}

const fov = 0.6 // Field of view
const fov_fp = tofpx(fov)

class SpriteObject {
    img: Image
    x_fp: number    // x position
    y_fp: number    // y position
    xVel_fp: number // x-Velocity
    yVel_fp: number // y-Velocity 
    uDiv_fp: number // Texture scaling x-axis
    vDiv_fp: number // Texture scaling y-axis
    onGround: number // Sprite stands on the ground 
    constructor(img: Image, x_fp: number, y_fp: number) {
        this.img = img
        this.x_fp = x_fp
        this.y_fp = y_fp
        this.xVel_fp = tofpx(0);
        this.yVel_fp = tofpx(0);
        this.uDiv_fp = tofpx(1);
        this.vDiv_fp = tofpx(1);
    }
}

let allSprites: SpriteObject[] = []
allSprites.push(new SpriteObject(assets.image`sprite`, tofpx(22), tofpx(8)))
allSprites.push(new SpriteObject(assets.image`sprite`, tofpx(17), tofpx(8)))

class State {
    // Variables which ends in '_fp' are fixed point. (integer scaled by fpx_scale)
    x_fp: number 
    y_fp: number 
    map: Image
    dirX_fp: number
    dirY_fp: number
    planeX_fp: number
    planeY_fp: number
    angle: number
    horizon_offset: number
    timeStamp_ms: number
    elapsed_ms: number
    
    constructor() {
        this.angle = 0
        this.x_fp = tofpx(18) 
        this.y_fp = tofpx(8)

        this.setVectors()
        this.map = assets.image`map`
        this.horizon_offset = 0
    }


    private setVectors() {
        const sin = Math.sin(this.angle)
        const cos = Math.cos(this.angle)
        // Direction vector (camera view direction)
        this.dirX_fp = tofpx(cos)
        this.dirY_fp = tofpx(sin)
        // Screen view plane vector (perpendicular to camera view)
        this.planeX_fp = tofpx(sin * fov)
        this.planeY_fp = tofpx(cos * -fov)
    }

    // Check map if x, y is not a wall.
    private canGo(x_fp: number, y_fp: number) {
        return this.map.getPixel(x_fp >> fpx, y_fp >> fpx) == 0
    }

    updateTime()
    {
        let now = game.runtime();
        this.elapsed_ms = now - st.timeStamp_ms 
        this.timeStamp_ms = now
    }

    updateControls() {
        const dx = controller.dx(2)
        if (dx) {
            if (controller.A.isPressed()) {
                // Side ways - strafing
                const nx_fp = this.x_fp + Math.round(dx * this.planeX_fp)
                const ny_fp = this.y_fp + Math.round(dx * this.planeY_fp)
                if (this.canGo(nx_fp, ny_fp)) {
                    this.x_fp = nx_fp
                    this.y_fp = ny_fp
                }
            }
            else {
                this.angle -= dx
                if (this.angle < -2 * Math.PI)
                    this.angle += 2 * Math.PI
                if (this.angle > 2 * Math.PI)
                    this.angle -= 2 * Math.PI
                this.setVectors()
            }
        }
        const dy = controller.dy(2)
        if (dy) {
            // Calculate a new position.
            const nx_fp = this.x_fp - Math.round(this.dirX_fp * dy)
            const ny_fp = this.y_fp - Math.round(this.dirY_fp * dy)
            if (!this.canGo(nx_fp, ny_fp) && this.canGo(this.x_fp, this.y_fp)) {
                if (this.canGo(this.x_fp, ny_fp))
                    this.y_fp = ny_fp
                else if (this.canGo(nx_fp, this.y_fp))
                    this.x_fp = nx_fp
            } else {
                this.x_fp = nx_fp
                this.y_fp = ny_fp
            }
        }
        if (dx || dy) {
            const bobbing = 8
            this.horizon_offset = Math.abs(Math.idiv(this.timeStamp_ms, 50) % bobbing - (bobbing>>1) )
        }
            
    }

    trace() {
        // based on https://lodev.org/cgtutor/raycasting.html
        const w = screen.width
        const h = screen.height


        /////////////////////
        // Draw sky color
        /////////////////////
        screen.fillRect(0, 0, w, (h >> 1) + this.horizon_offset, 13)

        /////////////////////
        // Draw walls
        /////////////////////
        let depth_map_fp: number[] = [] // Depth map for each ray cast.
        // For each pixel column along the width of the screen, cast a ray onto the map and test for ray intersections.
        for (let x = 0; x < w; x++) {
            const cameraX_fp: number = Math.idiv((x << fpx) << 1, w) - one_fp
            // Direction of the ray.
            let rayDirX_fp = this.dirX_fp + (this.planeX_fp * cameraX_fp >> fpx)
            let rayDirY_fp = this.dirY_fp + (this.planeY_fp * cameraX_fp >> fpx)
            // Map square (initialize to player/camera position)
            let mapX = this.x_fp >> fpx
            let mapY = this.y_fp >> fpx

            // length of ray from current position to next x or y-side
            let sideDistX = 0, sideDistY = 0

            // avoid division by zero
            if (rayDirX_fp == 0) rayDirX_fp = 1
            if (rayDirY_fp == 0) rayDirY_fp = 1

            // length of ray from one x or y-side to next x or y-side
            const deltaDistX = Math.abs(Math.idiv(one2, rayDirX_fp));
            const deltaDistY = Math.abs(Math.idiv(one2, rayDirY_fp));

            let mapStepX = 0, mapStepY = 0

            let sideWallHit = false;

            //calculate step and initial sideDist
            if (rayDirX_fp < 0) {
                mapStepX = -1;
                sideDistX = ((this.x_fp - (mapX << fpx)) * deltaDistX) >> fpx;
            } else {
                mapStepX = 1;
                sideDistX = (((mapX << fpx) + one_fp - this.x_fp) * deltaDistX) >> fpx;
            }
            if (rayDirY_fp < 0) {
                mapStepY = -1;
                sideDistY = ((this.y_fp - (mapY << fpx)) * deltaDistY) >> fpx;
            } else {
                mapStepY = 1;
                sideDistY = (((mapY << fpx) + one_fp - this.y_fp) * deltaDistY) >> fpx;
            }

            let color = 0

            while (true) {
                //jump to next map square, OR in x-direction, OR in y-direction
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX;
                    mapX += mapStepX;
                    sideWallHit = false;
                } else {
                    sideDistY += deltaDistY;
                    mapY += mapStepY;
                    sideWallHit = true;
                }

                color = this.map.getPixel(mapX, mapY)
                if (color)
                {
                    color--
                    break; // hit!
                }
            }

            let perpWallDist_fp = 0
            let wallX = 0
            if (!sideWallHit) {
                perpWallDist_fp = Math.idiv(((mapX << fpx) - this.x_fp + (1 - mapStepX << fpx - 1)) << fpx, rayDirX_fp)
                wallX = this.y_fp + (perpWallDist_fp * rayDirY_fp >> fpx);
            } else {
                perpWallDist_fp = Math.idiv(((mapY << fpx) - this.y_fp + (1 - mapStepY << fpx - 1)) << fpx, rayDirY_fp)
                wallX = this.x_fp + (perpWallDist_fp * rayDirX_fp >> fpx);
            }
            wallX &= (1 << fpx) - 1
            depth_map_fp.push(perpWallDist_fp)
            let tex: Image
            if (color < numTexture) {
                // Normal texture.
                tex = textures[color]
            }
            else {
                // Animated textures.
                let anim = animTextures[color - numTexture]
                const frameTime_ms = 200 // ms per frame.
                tex = anim[Math.idiv(this.timeStamp_ms,  frameTime_ms)% anim.length]
            } 

            if (!tex)
                continue
            // textures look much better when lineHeight is odd
            let lineHeight = Math.idiv(h << fpx, perpWallDist_fp) | 1;
            let drawStart = ((-lineHeight + h) >> 1) + this.horizon_offset

            let texX = (wallX * tex.width) >> fpx;
            if ((!sideWallHit && rayDirX_fp > 0) || (sideWallHit && rayDirY_fp < 0))
                texX = tex.width - texX - 1;

            screen.blitRow(x, drawStart, tex, texX, lineHeight)
        }
        /////////////////////
        // Draw sprites
        /////////////////////
        // Sort all sprites based on distance to the camera.
        const mapped = allSprites.map((v, i) => {
            // No need to take sqrt when just sorting.
            return { i:i, value: (this.x_fp - v.x_fp) ** 2 + (this.y_fp - v.y_fp) ** 2 };
        });

        mapped.sort((a, b) => {
            if (a.value > b.value) { return -1; }
            if (a.value < b.value) { return 1; }
            return 0;
        });
        
        // Draw the sorted sprite list
        mapped.forEach(mapIdx => {
            let s = allSprites[mapIdx.i]
            this.drawSprite(s, depth_map_fp)
        });
    }

    updateSprites()
    {
                let w_fp = screen.width << fpx
        let h_fp = screen.height << fpx
        for (let i =  allSprites.length - 1; i >= 0; i--)
        {
            let s = allSprites[i]
            s.x_fp += Math.idiv(this.elapsed_ms * s.xVel_fp, 1000) 
            s.y_fp += Math.idiv(this.elapsed_ms * s.yVel_fp, 1000)
            if (s.x_fp < 0 || s.y_fp < 0 || s.x_fp > w_fp || s.y_fp > h_fp)
            {
                allSprites.removeAt(i);
                console.log("destroying sprite")
            }
        }
    }

    drawSprite(s: SpriteObject, depth_map_fp: number[]) {
        const w = screen.width
        const h = screen.height

        let spriteX_fp = s.x_fp - this.x_fp
        let spriteY_fp = s.y_fp - this.y_fp
        // Transform the sprite coordinates to the camera coordinate system.
        // Project sprite vector onto normalized camera axis:  ~ (dirX, dirY)
        let transformY_fp = (spriteX_fp * this.dirX_fp + spriteY_fp * this.dirY_fp) >> fpx
        if (transformY_fp < 0){
            return // Behind camera.
        }
        // Project sprite vector onto normalized plane axis:  ~ (dirY, -dirX)
        let transformX_fp =Math.idiv(spriteX_fp * this.dirY_fp - spriteY_fp * this.dirX_fp, fov_fp)
        // Calculate screen X position of the sprite,
        let spriteScreenX = (w * (one_fp + Math.idiv(transformX_fp << fpx, transformY_fp))) >> (fpx + 1)
        //calculate height and width of the sprite on screen
        let spriteScreenHeight = Math.idiv(h << fpx, Math.abs(transformY_fp))  //using 'transformY' instead of the real distance prevents fisheye
        let spriteScreenWidth = spriteScreenHeight

        // Scale the sprite in x and y direction.
        spriteScreenHeight = Math.idiv(spriteScreenHeight << fpx, s.vDiv_fp) | 1;
        spriteScreenWidth = Math.idiv(spriteScreenWidth << fpx, s.uDiv_fp) | 1;
        // Place sprite on ground?
        let vMoveScreen = s.onGround ? Math.idiv(s.vDiv_fp * s.img.height, transformY_fp) : 0
        let drawStartY = ((-spriteScreenHeight + h) >> 1) + this.horizon_offset + vMoveScreen
        let drawStartX = spriteScreenX - (spriteScreenWidth >> 1)
        let drawStartX_offset = -drawStartX
        if (drawStartX < 0) {
            drawStartX = 0;
        }
        let drawEndX = spriteScreenX + (spriteScreenWidth >> 1)
        if (drawEndX >= w) drawEndX = w - 1
        // loop through every vertical stripe of the sprite on screen
        for(let stripe = drawStartX; stripe < drawEndX; stripe++)
        {
            if (transformY_fp >= depth_map_fp[stripe]) {
                continue // behind a wall
            }
            let texX = Math.idiv(s.img.width * (stripe + drawStartX_offset) << fpx, spriteScreenWidth) >> fpx
            screen.blitRow(stripe, drawStartY, s.img, texX, spriteScreenHeight)
        }
    }
}

const st = new State()
game.onUpdate(function () {
    st.updateTime()
    st.updateControls()
    st.updateSprites()
})
game.onPaint(function () {
    st.trace()
})

controller.B.onEvent(ControllerButtonEvent.Pressed, () =>
{
    let s = new SpriteObject(assets.image`sprite`, st.x_fp, st.y_fp)
    s.uDiv_fp = tofpx(3)
    s.vDiv_fp = tofpx(3)
    s.xVel_fp = st.dirX_fp << 2
    s.yVel_fp = st.dirY_fp << 2
    allSprites.push(s)
}
)

