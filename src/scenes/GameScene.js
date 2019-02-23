import Girl from '../sprites/girl';
import Slime from '../sprites/slime';
import Fire from '../sprites/Fire';

const CAMERA_PAN = 10;

class GameScene extends Phaser.Scene {
    constructor(test) {
        super({
            key: 'GameScene'
        });
    }

    preload() {
    }

    create() {
        // Array of rooms to keep bounds within to avoid the need of multiple tilemaps per level.
        // It might be a singe screen room like when going down a pipe or a sidescrolling level.
        // It's defined as objects in Tiled.
        this.rooms = [];

        // Add and play the music
        this.music = this.sound.add('overworld');
        this.music.play({
            loop: true
        });

        // Add the map + bind the tileset
        this.map = this.make.tilemap({
            key: 'map'
        });
        this.tileset = this.map.addTilesetImage('basictiles', 'basictiles');
        this.tilesetEnemies = this.map.addTilesetImage('characters', 'characters');

        // Dynamic layer because we want breakable and animated tiles
        this.groundLayer = this.map.createDynamicLayer('world', this.tileset, 0, 0);
        this.groundLayer2 = this.map.createDynamicLayer('world2', this.tileset, 0, 0);

        // Probably not the correct way of doing this:
        this.physics.world.bounds.width = this.groundLayer.width;

        // Set collision by property
        this.groundLayer.setCollisionByProperty({
            collide: true
        });

        this.girlGroup = this.add.group();

        // This group contains all enemies for collision and calling update-methods
        this.enemyGroup = this.add.group();

        // Populate enemyGroup, powerUps, pipes and destinations from object layers
        this.parseObjectLayers();

        this.keys = {
            fire: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
            up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP)
        };

        this.createHUD();

        // Mute music while in attract mode
        if (this.attractMode) {
            this.music.volume = 0;
        }

        // If the game ended while physics was disabled
        this.physics.world.resume();

        this.girlGroup.add(new Girl({
            scene: this,
            key: 'pepper',
            x: 16 * 6,
            y: this.sys.game.config.height - 48 - 48
        }));
        this.girlGroup.add(new Girl({
            scene: this,
            key: 'coriander',
            x: 16 * 6,
            y: this.sys.game.config.height - 48 - 48 - 48
        }));

        this.cameras.main.roundPixels = true;

        this.fireballs = this.add.group({
            classType: Fire,
            maxSize: 10,
            runChildUpdate: false // Due to https://github.com/photonstorm/phaser/issues/3724
        });
    }

    update(time, delta) {
        Array.from(this.fireballs.children.entries).forEach(
            (fireball) => {
                fireball.update(time, delta);
            });

        if (this.physics.world.isPaused) {
            return;
        }

        this.levelTimer.time -= delta * 2;
        if (this.levelTimer.time - this.levelTimer.displayedTime * 1000 < 1000) {
            this.levelTimer.displayedTime = Math.round(this.levelTimer.time / 1000);
            this.levelTimer.textObject.setText(('' + this.levelTimer.displayedTime).padStart(3, '0'));
        }

        let input = {
            left: this.keys.left.isDown,
            right: this.keys.right.isDown,
            up: this.keys.up.isDown,
            down: this.keys.down.isDown,
            fire: this.keys.fire.isDown
        };
        if (input.left) {
            this.cameras.main.scrollX -= CAMERA_PAN;
        }
        if (input.right) {
            this.cameras.main.scrollX += CAMERA_PAN;
        }

        this.girlGroup.children.entries.forEach(
            sprite => { sprite.update(this.keys, time, delta); }
        );

        // Run the update method of all enemies
        this.enemyGroup.children.entries.forEach(
            (sprite) => {
                sprite.update(time, delta);
            }
        );
    }

    tileCollision(sprite, tile) {
        if (sprite.type === 'mario') {
        }

        // If it's Mario and the body isn't blocked up it can't hit question marks or break bricks
        // Otherwise Mario will break bricks he touch from the side while moving up.
        if (sprite.type === 'mario' && !sprite.body.blocked.up) {
            return;
        }

        // If the tile has a callback, lets fire it
        if (tile.properties.callback) {
            switch (tile.properties.callback) {
                default:
                    sprite.scene.sound.playAudioSprite('sfx', 'smb_bump');
                    break;
            }
        } else {
            sprite.scene.sound.playAudioSprite('sfx', 'smb_bump');
        }
    }

    updateScore(score) {
        this.score.pts += score;
        this.score.textObject.setText(('' + this.score.pts).padStart(6, '0'));
    }

    parseObjectLayers() {
        // The map has one object layer with enemies as stamped tiles,
        // each tile has properties containing info on what enemy it represents.
        this.map.getObjectLayer('enemies').objects.forEach(
            (enemy) => {
                let enemyObject;
                const index = enemy.gid - 1 - this.tilesetEnemies.firstgid;
                const tileProps = this.tilesetEnemies.tileProperties[index];
                switch (tileProps.name) {
                    case 'slime':
                        enemyObject = new Slime({
                            scene: this,
                            key: 'characters',
                            x: enemy.x,
                            y: enemy.y
                        });
                        break;
                    default:
                        console.error('Unknown:', tileProps); // eslint-disable-line no-console
                        break;
                }
                this.enemyGroup.add(enemyObject);
            }
        );

        // The map has an object layer with 'modifiers' that do 'stuff', see below
        /*this.map.getObjectLayer('modifiers').objects.forEach((modifier) => {
            let tile, properties, type;

            // Get property stuff from the tile if present or just from the object layer directly
            if (typeof modifier.gid !== 'undefined') {
                properties = this.tileset.tileProperties[modifier.gid - 1];
                type = properties.type;
                if (properties.hasOwnProperty('powerUp')) {
                    type = 'powerUp';
                }
            } else {
                type = modifier.properties.type;
            }

            switch (type) {
                case 'powerUp':
                    // Modifies a questionmark below the modifier to contain something else than the default (coin)
                    tile = this.groundLayer.getTileAt(modifier.x / 16, modifier.y / 16 - 1);
                    tile.powerUp = properties.powerUp;
                    tile.properties.callback = 'questionMark';
                    if (!tile.collides) {
                        // Hidden block without a question mark
                        tile.setCollision(false, false, false, true);
                    }
                    break;
                case 'pipe':
                    // Adds info on where to go from a pipe under the modifier
                    tile = this.groundLayer.getTileAt(modifier.x / 16, modifier.y / 16);
                    tile.properties.dest = parseInt(modifier.properties.goto);
                    break;
                case 'dest':
                    // Adds a destination so that a pipe can find it
                    this.destinations[modifier.properties.id] = {
                        x: modifier.x + modifier.width / 2,
                        top: (modifier.y < 16)
                    };
                    break;
                case 'room':
                    // Adds a 'room' that is just info on bounds so that we can add sections below pipes
                    // in an level just using one tilemap.
                    this.rooms.push({
                        x: modifier.x,
                        width: modifier.width,
                        sky: modifier.properties.sky
                    });
                    break;
            }
        });*/
    }

    createHUD() {
        const hud = this.add.bitmapText(5 * 8, 8, 'font', 'MARIO                      TIME', 8);
        hud.setScrollFactor(0, 0);
        this.levelTimer = {
            textObject: this.add.bitmapText(36 * 8, 16, 'font', '255', 8),
            time: 150 * 1000,
            displayedTime: 255,
            hurry: false
        };
        this.levelTimer.textObject.setScrollFactor(0, 0);
        this.score = {
            pts: 0,
            textObject: this.add.bitmapText(5 * 8, 16, 'font', '000000', 8)
        };
        this.score.textObject.setScrollFactor(0, 0);

        if (this.attractMode) {
            hud.alpha = 0;
            this.levelTimer.textObject.alpha = 0;
            this.score.textObject.alpha = 0;
        }
    }

    cleanUp() {
        // Never called since 3.10 update (I called it from create before). If Everything is fine, I'll remove this method.
        // Scenes isn't properly destroyed yet.
        let ignore = ['sys', 'anims', 'cache', 'registry', 'sound', 'textures', 'events', 'cameras', 'make', 'add', 'scene', 'children', 'cameras3d', 'time', 'data', 'input', 'load', 'tweens', 'lights', 'physics'];
        let whatThisHad = ['sys', 'anims', 'cache', 'registry', 'sound', 'textures', 'events', 'cameras', 'make', 'add', 'scene', 'children', 'cameras3d', 'time', 'data', 'input', 'load', 'tweens', 'lights', 'physics', 'rooms', 'music', 'map', 'tileset', 'groundLayer', 'mario', 'enemyGroup', 'keys', 'levelTimer', 'score', 'touchControls'];
        whatThisHad.forEach(key => {
            if (ignore.indexOf(key) === -1 && this[key]) {
                switch (key) {
                    case 'enemyGroup':
                    case 'music':
                    case 'map':
                        this[key].destroy();
                        break;
                }
                this[key] = null;
            }
        });
    }
}

export default GameScene;
