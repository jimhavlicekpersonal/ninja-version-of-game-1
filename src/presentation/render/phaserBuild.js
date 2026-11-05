/**
 * The Phaser 3.90 the production build ships (first-load size, client re-audit item 5).
 *
 * `vite.config.ts` points `import Phaser from 'phaser'` here for `vite build` only (dev and tests
 * use the full package). It is `phaser/src/phaser-core.js` plus the parts the game uses
 * (full Math, Display, Geom, Actions, Utils; Container and Particle game objects), and leaves
 * out physics (Arcade and Matter), sound, tilemaps, curves, bitmap text, mesh/shader/video
 * objects, the Facebook and Camera3D plugins. The `typeof WEBGL_RENDERER`-style feature flags
 * in Phaser's sources are replaced at build time by the same plugin (`phaserFlags`).
 *
 * Adding a Phaser feature: if the game starts using a module or game object listed as left out
 * above (for example `this.add.bitmapText`, `this.physics`, `this.sound`), add it here, or the
 * production build fails at run time while `npm run dev` works. `tests/presentation/render/
 * phaserBuild.test.ts` checks every `this.add.<kind>` the scenes call is registered here.
 */
import CONST from 'phaser/src/const';
import Extend from 'phaser/src/utils/object/Extend';

import Actions from 'phaser/src/actions';
import Animations from 'phaser/src/animations';
import BlendModes from 'phaser/src/renderer/BlendModes';
import Cache from 'phaser/src/cache';
import Cameras from 'phaser/src/cameras';
import Core from 'phaser/src/core';
import Class from 'phaser/src/utils/Class';
import Data from 'phaser/src/data';
import Display from 'phaser/src/display';
import DOM from 'phaser/src/dom';
import Events from 'phaser/src/events';
import FX from 'phaser/src/fx';
import Game from 'phaser/src/core/Game';
import Geom from 'phaser/src/geom';
import Input from 'phaser/src/input';
import Loader from 'phaser/src/loader';
import PMath from 'phaser/src/math';
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
import Utils from 'phaser/src/utils';

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
import ContainerFactory from 'phaser/src/gameobjects/container/ContainerFactory';
import GraphicsFactory from 'phaser/src/gameobjects/graphics/GraphicsFactory';
import ImageFactory from 'phaser/src/gameobjects/image/ImageFactory';
import LayerFactory from 'phaser/src/gameobjects/layer/LayerFactory';
import ParticlesFactory from 'phaser/src/gameobjects/particles/ParticleEmitterFactory';
import SpriteFactory from 'phaser/src/gameobjects/sprite/SpriteFactory';
import TextFactory from 'phaser/src/gameobjects/text/TextFactory';
import ContainerCreator from 'phaser/src/gameobjects/container/ContainerCreator';
import GraphicsCreator from 'phaser/src/gameobjects/graphics/GraphicsCreator';
import ImageCreator from 'phaser/src/gameobjects/image/ImageCreator';
import LayerCreator from 'phaser/src/gameobjects/layer/LayerCreator';
import ParticlesCreator from 'phaser/src/gameobjects/particles/ParticleEmitterCreator';
import SpriteCreator from 'phaser/src/gameobjects/sprite/SpriteCreator';
import TextCreator from 'phaser/src/gameobjects/text/TextCreator';

const Phaser = Extend(
  false,
  {
    Actions,
    Animations,
    BlendModes,
    Cache,
    Cameras,
    Core,
    Class,
    Data,
    Display,
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
      Factories: { Container: ContainerFactory, Graphics: GraphicsFactory, Image: ImageFactory, Layer: LayerFactory, Particles: ParticlesFactory, Sprite: SpriteFactory, Text: TextFactory },
      Creators: { Container: ContainerCreator, Graphics: GraphicsCreator, Image: ImageCreator, Layer: LayerCreator, Particles: ParticlesCreator, Sprite: SpriteCreator, Text: TextCreator },
    },
    Geom,
    Input,
    Loader,
    Math: PMath,
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
    Utils,
  },
  CONST,
);

export default Phaser;
