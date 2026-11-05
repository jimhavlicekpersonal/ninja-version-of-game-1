/**
 * The Phaser 3.90 the production build ships (first-load size, client re-audit item 5).
 *
 * `vite.config.ts` points `import Phaser from 'phaser'` here for `vite build` only (dev and tests
 * use the full package). It is close to `phaser/src/phaser-core.js`: the namespaces the game
 * names (`Phaser.Math.Clamp/Distance/Vector2`, `Scale`, `Scenes`, `Core`, `Textures`, `Tweens`,
 * `Input.Pointer`) and the game objects it adds (image, graphics, text, container, particles,
 * plus layer and sprite), the keyboard input plugin and the image loader. It leaves out physics
 * (Arcade and Matter), sound, tilemaps, curves, gamepad, the other loader file types, bitmap
 * text, mesh/shader/video objects and the Facebook and Camera3D plugins. Phaser's own modules
 * still `require` whatever they need internally, so only unused namespaces are dropped. The `typeof WEBGL_RENDERER`-style feature flags
 * in Phaser's sources are replaced at build time by the same plugin (`phaserFlags`).
 *
 * Adding a Phaser feature: if the game starts using a module or game object listed as left out
 * above (for example `this.add.bitmapText`, `this.physics`, `this.sound`), add it here, or the
 * production build fails at run time while `npm run dev` works. `tests/presentation/render/
 * phaserBuild.test.ts` checks every `this.add.<kind>` the scenes call is registered here.
 */
import CONST from 'phaser/src/const';
import Extend from 'phaser/src/utils/object/Extend';

import Animations from 'phaser/src/animations';
import BlendModes from 'phaser/src/renderer/BlendModes';
import Cache from 'phaser/src/cache';
import Cameras from 'phaser/src/cameras';
import Core from 'phaser/src/core';
import Class from 'phaser/src/utils/Class';
import Data from 'phaser/src/data';
import DOM from 'phaser/src/dom';
import Events from 'phaser/src/events';
import FX from 'phaser/src/fx';
import Game from 'phaser/src/core/Game';
import InputConst from 'phaser/src/input/const';
import InputEvents from 'phaser/src/input/events';
import InputManager from 'phaser/src/input/InputManager';
import InputPlugin from 'phaser/src/input/InputPlugin';
import Pointer from 'phaser/src/input/Pointer';
import Keyboard from 'phaser/src/input/keyboard'; // registers the keyboard plugin (VillageScene keys)
import LoaderConst from 'phaser/src/loader/const';
import LoaderEvents from 'phaser/src/loader/events';
import LoaderPlugin from 'phaser/src/loader/LoaderPlugin';
import LoaderFile from 'phaser/src/loader/File';
import FileTypesManager from 'phaser/src/loader/FileTypesManager';
import ImageFile from 'phaser/src/loader/filetypes/ImageFile'; // registers `load.image` (real art, artManifest.ts)
import Clamp from 'phaser/src/math/Clamp';
import Distance from 'phaser/src/math/distance';
import Vector2 from 'phaser/src/math/Vector2';
import Between from 'phaser/src/math/Between';
import DegToRad from 'phaser/src/math/DegToRad';
import RadToDeg from 'phaser/src/math/RadToDeg';
import FloatBetween from 'phaser/src/math/FloatBetween';
import Plugins from 'phaser/src/plugins';
import Renderer from 'phaser/src/renderer';
import Scale from 'phaser/src/scale';
import ScaleModes from 'phaser/src/renderer/ScaleModes';
import Scene from 'phaser/src/scene/Scene';
import Scenes from 'phaser/src/scene';
import Structs from 'phaser/src/structs';
import Textures from 'phaser/src/textures';
import Time from 'phaser/src/time';
import Tweens from 'phaser/src/tweens';

import DisplayList from 'phaser/src/gameobjects/DisplayList';
import GameObjectCreator from 'phaser/src/gameobjects/GameObjectCreator';
import GameObjectFactory from 'phaser/src/gameobjects/GameObjectFactory';
import UpdateList from 'phaser/src/gameobjects/UpdateList';
import Components from 'phaser/src/gameobjects/components';
import BuildGameObject from 'phaser/src/gameobjects/BuildGameObject';
import GameObject from 'phaser/src/gameobjects/GameObject';
import Container from 'phaser/src/gameobjects/container/Container';
import Graphics from 'phaser/src/gameobjects/graphics/Graphics';
import Image from 'phaser/src/gameobjects/image/Image';
import Layer from 'phaser/src/gameobjects/layer/Layer';
import Particles from 'phaser/src/gameobjects/particles';
import Sprite from 'phaser/src/gameobjects/sprite/Sprite';
import Text from 'phaser/src/gameobjects/text/Text';
// Factories and creators register `scene.add.<kind>` / `scene.make.<kind>` when loaded.
import 'phaser/src/gameobjects/container/ContainerFactory';
import 'phaser/src/gameobjects/graphics/GraphicsFactory';
import 'phaser/src/gameobjects/image/ImageFactory';
import 'phaser/src/gameobjects/layer/LayerFactory';
import 'phaser/src/gameobjects/particles/ParticleEmitterFactory';
import 'phaser/src/gameobjects/sprite/SpriteFactory';
import 'phaser/src/gameobjects/text/TextFactory';
import 'phaser/src/gameobjects/container/ContainerCreator';
import 'phaser/src/gameobjects/graphics/GraphicsCreator';
import 'phaser/src/gameobjects/image/ImageCreator';
import 'phaser/src/gameobjects/layer/LayerCreator';
import 'phaser/src/gameobjects/particles/ParticleEmitterCreator';
import 'phaser/src/gameobjects/sprite/SpriteCreator';
import 'phaser/src/gameobjects/text/TextCreator';

const Phaser = Extend(
  false,
  {
    Animations,
    BlendModes,
    Cache,
    Cameras,
    Core,
    Class,
    Data,
    DOM,
    Events,
    FX,
    Game,
    GameObjects: {
      DisplayList,
      GameObjectCreator,
      GameObjectFactory,
      UpdateList,
      Components,
      BuildGameObject,
      GameObject,
      Container,
      Graphics,
      Image,
      Layer,
      Particles,
      Sprite,
      Text,
    },
    Input: Extend(false, { Events: InputEvents, InputManager, InputPlugin, Pointer, Keyboard }, InputConst),
    Loader: Extend(false, { Events: LoaderEvents, LoaderPlugin, File: LoaderFile, FileTypesManager, FileTypes: { ImageFile } }, LoaderConst),
    Math: { Clamp, Distance, Vector2, Between, DegToRad, RadToDeg, FloatBetween },
    Plugins,
    Renderer,
    Scale,
    ScaleModes,
    Scene,
    Scenes,
    Structs,
    Textures,
    Time,
    Tweens,
  },
  CONST,
);

export default Phaser;
