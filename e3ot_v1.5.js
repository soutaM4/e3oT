(function(Scratch) {
  'use strict';

  class ThreeDExtension {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.objects = new Map();
      this.nextObjectId = 1;
      this.isInitialized = false;
      this.container = null;
      this.positionUpdateInterval = null;
      this.stageElement = null;
      this.stageCanvas = null;
      this.compositeCanvas = null;
      this.compositeContext = null;
      this.renderOrder = 'overlay';
      this.currentBlendMode = 'source-over';
      this.current3DOpacity = 0.9;
      this.lights = new Map();
      this.nextLightId = 1;
      this.animationId = null;
      this.threeJSLoaded = false;
      this.gltfLoaderLoaded = false;
      this.GLTFLoader = null;
      this.initPromise = null;
      this.zIndexMode = 'auto';
      this.enable3D = true;
      this.resizeObserver = null;
      
      // 3Dモデルアセット管理
      this.modelAssets = new Map(); // assetId -> { name, data, type }
      this.nextAssetId = 1;
      
      this.loadThreeJS();
    }

    async loadThreeJS() {
      if (typeof THREE !== 'undefined') {
        this.threeJSLoaded = true;
        return Promise.resolve();
      }
      
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        script.onload = () => {
          console.log('Three.js loaded successfully');
          this.threeJSLoaded = true;
          resolve();
        };
        script.onerror = () => {
          console.error('Failed to load Three.js');
          reject(new Error('Three.js failed to load'));
        };
        document.head.appendChild(script);
      });
    }

    async loadGLTFLoader() {
      if (this.gltfLoaderLoaded) return Promise.resolve();
      
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
        script.onload = () => {
          console.log('GLTFLoader loaded successfully');
          this.GLTFLoader = THREE.GLTFLoader;
          this.gltfLoaderLoaded = true;
          resolve();
        };
        script.onerror = () => {
          console.error('Failed to load GLTFLoader');
          reject(new Error('GLTFLoader failed to load'));
        };
        document.head.appendChild(script);
      });
    }

    async waitForThreeJS() {
      if (this.threeJSLoaded) return;
      
      let attempts = 0;
      while (!this.threeJSLoaded && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (typeof THREE !== 'undefined') {
          this.threeJSLoaded = true;
          break;
        }
      }
      
      if (!this.threeJSLoaded) {
        throw new Error('Three.js loading timeout');
      }
    }

    async waitForGLTFLoader() {
      if (this.gltfLoaderLoaded) return;
      
      let attempts = 0;
      while (!this.gltfLoaderLoaded && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        if (typeof THREE.GLTFLoader !== 'undefined') {
          this.gltfLoaderLoaded = true;
          break;
        }
      }
      
      if (!this.gltfLoaderLoaded) {
        throw new Error('GLTFLoader loading timeout');
      }
    }

    getInfo() {
      return {
        id: 'threedee',
        name: '3D表示',
        color1: '#FF6B6B',
        color2: '#FF5252',
        blocks: [
          {
            opcode: 'init',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dを初期化する'
          },
          '---',
          {
            opcode: 'addCube',
            blockType: Scratch.BlockType.COMMAND,
            text: '立方体を追加 サイズ [SIZE] 色 [COLOR]',
            arguments: {
              SIZE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ff0000'
              }
            }
          },
          {
            opcode: 'addSphere',
            blockType: Scratch.BlockType.COMMAND,
            text: '球体を追加 半径 [RADIUS] 色 [COLOR]',
            arguments: {
              RADIUS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#00ff00'
              }
            }
          },
          {
            opcode: 'addCylinder',
            blockType: Scratch.BlockType.COMMAND,
            text: '円柱を追加 半径 [RADIUS] 高さ [HEIGHT] 色 [COLOR]',
            arguments: {
              RADIUS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              HEIGHT: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 2
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#0000ff'
              }
            }
          },
          {
            opcode: 'addPlane',
            blockType: Scratch.BlockType.COMMAND,
            text: '平面を追加 幅 [WIDTH] 高さ [HEIGHT] 色 [COLOR]',
            arguments: {
              WIDTH: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 2
              },
              HEIGHT: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 2
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ffff00'
              }
            }
          },
          '---',
          {
            opcode: 'loadModelFile',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dモデルファイルを読み込み 名前 [NAME]',
            arguments: {
              NAME: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'mymodel'
              }
            }
          },
          {
            opcode: 'addModelFromAsset',
            blockType: Scratch.BlockType.COMMAND,
            text: 'アセット [ASSET_ID] からモデルを追加 スケール [SCALE] 色 [COLOR] 透明度 [OPACITY] 明るさ [BRIGHTNESS]',
            arguments: {
              ASSET_ID: {
                type: Scratch.ArgumentType.STRING,
                menu: 'modelAssets',
                defaultValue: '1'
              },
              SCALE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.STRING,
                menu: 'colorOptions',
                defaultValue: 'default'
              },
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              BRIGHTNESS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'addModel',
            blockType: Scratch.BlockType.COMMAND,
            text: 'URLからモデルを追加 URL [URL] スケール [SCALE] 色 [COLOR] 透明度 [OPACITY] 明るさ [BRIGHTNESS]',
            arguments: {
              URL: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: 'https://example.com/model.gltf'
              },
              SCALE: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.STRING,
                menu: 'colorOptions',
                defaultValue: 'default'
              },
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              BRIGHTNESS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          '---',
          {
            opcode: 'setObjectPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の位置を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'moveObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] を x:[X] y:[Y] z:[Z] だけ移動',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'setObjectRotation',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の向きを x:[X] y:[Y] z:[Z] 度にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'rotateObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] を x:[X] y:[Y] z:[Z] 度回転',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'setObjectScale',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の大きさを x:[X] y:[Y] z:[Z] 倍にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setObjectColor',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の色を [COLOR] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ff0000'
              }
            }
          },
          {
            opcode: 'setObjectOpacity',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の透明度を [OPACITY] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setObjectBrightness',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] の明るさを [BRIGHTNESS] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              BRIGHTNESS: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'removeObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'オブジェクト [ID] を削除',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          '---',
          {
            opcode: 'setCameraPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラの位置を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 5
              }
            }
          },
          {
            opcode: 'moveCamera',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラを x:[X] y:[Y] z:[Z] だけ移動',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'setCameraRotation',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラの向きを x:[X] y:[Y] z:[Z] 度にする',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          {
            opcode: 'lookAtObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラでオブジェクト [ID] を見る',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'lookAtPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'カメラで位置 x:[X] y:[Y] z:[Z] を見る',
            arguments: {
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0
              }
            }
          },
          '---',
          {
            opcode: 'set3DDepth',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dの表示位置を [DEPTH] にする',
            arguments: {
              DEPTH: {
                type: Scratch.ArgumentType.STRING,
                menu: 'depthModes',
                defaultValue: 'front'
              }
            }
          },
          {
            opcode: 'set3DOpacity',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dの透明度を [OPACITY] にする',
            arguments: {
              OPACITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 0.9
              }
            }
          },
          {
            opcode: 'setBlendMode',
            blockType: Scratch.BlockType.COMMAND,
            text: '3Dの合成モードを [MODE] にする',
            arguments: {
              MODE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'blendModes',
                defaultValue: 'normal'
              }
            }
          },
          {
            opcode: 'enable3DRendering',
            blockType: Scratch.BlockType.COMMAND,
            text: '3D描画を [ENABLE] にする',
            arguments: {
              ENABLE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'enableOptions',
                defaultValue: 'on'
              }
            }
          },
          '---',
          {
            opcode: 'addLight',
            blockType: Scratch.BlockType.COMMAND,
            text: '[TYPE] ライトを追加 色 [COLOR] 強度 [INTENSITY]',
            arguments: {
              TYPE: {
                type: Scratch.ArgumentType.STRING,
                menu: 'lightTypes',
                defaultValue: 'directional'
              },
              COLOR: {
                type: Scratch.ArgumentType.COLOR,
                defaultValue: '#ffffff'
              },
              INTENSITY: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          {
            opcode: 'setLightPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'ライト [ID] の位置を x:[X] y:[Y] z:[Z] にする',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 3
              },
              X: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Y: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              Z: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              }
            }
          },
          '---',
          {
            opcode: 'removeModelAsset',
            blockType: Scratch.BlockType.COMMAND,
            text: 'アセット [ASSET_ID] を削除',
            arguments: {
              ASSET_ID: {
                type: Scratch.ArgumentType.STRING,
                menu: 'modelAssets',
                defaultValue: '1'
              }
            }
          },
          {
            opcode: 'listModelAssets',
            blockType: Scratch.BlockType.REPORTER,
            text: 'モデルアセット一覧'
          },
          {
            opcode: 'getModelAssetName',
            blockType: Scratch.BlockType.REPORTER,
            text: 'アセット [ASSET_ID] の名前',
            arguments: {
              ASSET_ID: {
                type: Scratch.ArgumentType.STRING,
                menu: 'modelAssets',
                defaultValue: '1'
              }
            }
          },
          {
            opcode: 'exportProjectData',
            blockType: Scratch.BlockType.REPORTER,
            text: 'プロジェクトデータを書き出し'
          },
          {
            opcode: 'importProjectData',
            blockType: Scratch.BlockType.COMMAND,
            text: 'プロジェクトデータを読み込み [DATA]',
            arguments: {
              DATA: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: ''
              }
            }
          },
          '---',
          {
            opcode: 'getObjectCount',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト数'
          },
          {
            opcode: 'getLastObjectId',
            blockType: Scratch.BlockType.REPORTER,
            text: '最後に作成したオブジェクトのID'
          },
          {
            opcode: 'getObjectPosition',
            blockType: Scratch.BlockType.REPORTER,
            text: 'オブジェクト [ID] の [AXIS] 座標',
            arguments: {
              ID: {
                type: Scratch.ArgumentType.NUMBER,
                defaultValue: 1
              },
              AXIS: {
                type: Scratch.ArgumentType.STRING,
                menu: 'axes',
                defaultValue: 'x'
              }
            }
          },
          {
            opcode: 'getCameraPosition',
            blockType: Scratch.BlockType.REPORTER,
            text: 'カメラの [AXIS] 座標',
            arguments: {
              AXIS: {
                type: Scratch.ArgumentType.STRING,
                menu: 'axes',
                defaultValue: 'x'
              }
            }
          },
          '---',
          {
            opcode: 'clearScene',
            blockType: Scratch.BlockType.COMMAND,
            text: 'すべての3Dオブジェクトを削除'
          },
          {
            opcode: 'pause3D',
            blockType: Scratch.BlockType.COMMAND,
            text: '3D描画を一時停止'
          },
          {
            opcode: 'resume3D',
            blockType: Scratch.BlockType.COMMAND,
            text: '3D描画を再開'
          }
        ],
        menus: {
          depthModes: {
            acceptReporters: false,
            items: [
              { text: '最前面', value: 'front' },
              { text: '最背面', value: 'back' },
              { text: 'スプライトの後ろ', value: 'behind' }
            ]
          },
          blendModes: {
            acceptReporters: false,
            items: [
              { text: '通常', value: 'normal' },
              { text: '乗算', value: 'multiply' },
              { text: 'スクリーン', value: 'screen' },
              { text: 'オーバーレイ', value: 'overlay' },
              { text: 'ソフトライト', value: 'soft-light' },
              { text: 'ハードライト', value: 'hard-light' },
              { text: '差', value: 'difference' },
              { text: '除外', value: 'exclusion' }
            ]
          },
          enableOptions: {
            acceptReporters: false,
            items: [
              { text: 'オン', value: 'on' },
              { text: 'オフ', value: 'off' }
            ]
          },
          lightTypes: {
            acceptReporters: false,
            items: [
              { text: '平行光源', value: 'directional' },
              { text: '点光源', value: 'point' },
              { text: '環境光', value: 'ambient' }
            ]
          },
          axes: {
            acceptReporters: false,
            items: [
              { text: 'x', value: 'x' },
              { text: 'y', value: 'y' },
              { text: 'z', value: 'z' }
            ]
          },
          colorOptions: {
            acceptReporters: true,
            items: [
              { text: '元の色', value: 'default' },
              { text: 'カスタム', value: 'custom' }
            ]
          },
          modelAssets: {
            acceptReporters: true,
            items: this._getModelAssetItems()
          }
        }
      };
    }

    _getModelAssetItems() {
      const items = [];
      for (const [id, asset] of this.modelAssets) {
        items.push({ text: asset.name, value: id.toString() });
      }
      if (items.length === 0) {
        items.push({ text: 'アセットなし', value: '0' });
      }
      return items;
    }

    // アセット管理メソッド
    async loadModelFile(args) {
      const name = Scratch.Cast.toString(args.NAME) || 'model';
      
      try {
        // ファイル入力要素を作成
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.gltf,.glb';
        
        // ファイル選択時の処理
        input.onchange = async (event) => {
          const file = event.target.files[0];
          if (!file) {
            console.warn('ファイルが選択されていません');
            return;
          }
          
          try {
            const reader = new FileReader();
            const fileData = await new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('ファイル読み込みエラー'));
              reader.readAsArrayBuffer(file);
            });
            
            // アセットとして保存
            const assetId = this.nextAssetId++;
            const asset = {
              name: name,
              data: fileData,
              type: file.name.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf',
              originalName: file.name
            };
            
            this.modelAssets.set(assetId, asset);
            console.log(`3Dモデルをアセットとして保存しました (ID: ${assetId}, 名前: ${name}, ファイル: ${file.name})`);
            
            // メニューを更新
            this._updateModelAssetMenu();
            
          } catch (error) {
            console.error(`ファイル読み込みエラー: ${file.name}`, error);
          }
          
          // 入力要素を削除
          input.remove();
        };
        
        // ファイル選択ダイアログを表示
        input.click();
      } catch (error) {
        console.error('ファイル選択処理エラー', error);
      }
    }

    _updateModelAssetMenu() {
      // Scratchのメニューを動的に更新（可能な場合）
      if (this.runtime && this.runtime.requestUpdateForBlockType) {
        this.runtime.requestUpdateForBlockType('addModelFromAsset');
        this.runtime.requestUpdateForBlockType('removeModelAsset');
        this.runtime.requestUpdateForBlockType('getModelAssetName');
      }
    }

    async addModelFromAsset(args, util) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined' || !this.GLTFLoader) return;
      
      const assetId = parseInt(Scratch.Cast.toString(args.ASSET_ID)) || 0;
      const scale = Scratch.Cast.toNumber(args.SCALE);
      const colorOption = Scratch.Cast.toString(args.COLOR);
      const opacity = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.OPACITY)));
      const brightness = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.BRIGHTNESS)));
      
      const asset = this.modelAssets.get(assetId);
      if (!asset) {
        console.warn(`アセットID ${assetId} が見つかりません`);
        return;
      }
      
      try {
        const loader = new this.GLTFLoader();
        const gltf = await new Promise((resolve, reject) => {
          loader.parse(asset.data, '', resolve, reject);
        });
        
        const model = gltf.scene;
        model.scale.set(scale, scale, scale);
        
        // マテリアル処理
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material.transparent = opacity < 1;
            child.material.opacity = opacity;
            child.material.emissive = new THREE.Color(brightness, brightness, brightness);
            if (colorOption === 'custom') {
              const color = util ? util.target.getField('COLOR') : '#ffffff';
              child.material.color.setHex(parseInt(color.slice(1), 16));
            }
          }
        });
        
        this.scene.add(model);
        const id = this.nextObjectId++;
        this.objects.set(id, model);
        
        console.log(`アセット ${asset.name} からモデルを追加しました (ID: ${id}, 透明度: ${opacity}, 明るさ: ${brightness})`);
      } catch (error) {
        console.error(`アセット読み込みエラー: ${asset.name}`, error);
      }
    }

    removeModelAsset(args) {
      const assetId = parseInt(Scratch.Cast.toString(args.ASSET_ID)) || 0;
      
      if (this.modelAssets.has(assetId)) {
        const asset = this.modelAssets.get(assetId);
        this.modelAssets.delete(assetId);
        console.log(`アセット ${asset.name} (ID: ${assetId}) を削除しました`);
        this._updateModelAssetMenu();
      } else {
        console.warn(`アセットID ${assetId} が見つかりません`);
      }
    }

    listModelAssets() {
      const assetList = [];
      for (const [id, asset] of this.modelAssets) {
        assetList.push(`${id}: ${asset.name}`);
      }
      return assetList.join(', ') || 'アセットなし';
    }

    getModelAssetName(args) {
      const assetId = parseInt(Scratch.Cast.toString(args.ASSET_ID)) || 0;
      const asset = this.modelAssets.get(assetId);
      return asset ? asset.name : '';
    }

    // プロジェクトデータのエクスポート/インポート
    exportProjectData() {
      const projectData = {
        version: '1.0',
        modelAssets: {},
        nextAssetId: this.nextAssetId
      };
      
      // アセットデータをBase64エンコード
      for (const [id, asset] of this.modelAssets) {
        const uint8Array = new Uint8Array(asset.data);
        const base64Data = this._arrayBufferToBase64(uint8Array);
        projectData.modelAssets[id] = {
          name: asset.name,
          data: base64Data,
          type: asset.type,
          originalName: asset.originalName
        };
      }
      
      return JSON.stringify(projectData);
    }

    importProjectData(args) {
      const dataStr = Scratch.Cast.toString(args.DATA);
      if (!dataStr) {
        console.warn('データが空です');
        return;
      }
      
      try {
        const projectData = JSON.parse(dataStr);
        
        if (projectData.version && projectData.modelAssets) {
          // 既存のアセットをクリア
          this.modelAssets.clear();
          
          // アセットを復元
          for (const [id, assetData] of Object.entries(projectData.modelAssets)) {
            const arrayBuffer = this._base64ToArrayBuffer(assetData.data);
            const asset = {
              name: assetData.name,
              data: arrayBuffer,
              type: assetData.type,
              originalName: assetData.originalName
            };
            this.modelAssets.set(parseInt(id), asset);
          }
          
          this.nextAssetId = projectData.nextAssetId || this.nextAssetId;
          this._updateModelAssetMenu();
          
          console.log(`プロジェクトデータを読み込みました (${this.modelAssets.size} アセット)`);
        } else {
          console.warn('無効なプロジェクトデータ形式です');
        }
      } catch (error) {
        console.error('プロジェクトデータの読み込みエラー:', error);
      }
    }

    // Base64変換ユーティリティ
    _arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }

    _base64ToArrayBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    }

    async init() {
      if (this.isInitialized) {
        return;
      }

      if (this.initPromise) {
        return this.initPromise;
      }
      
      this.initPromise = this._doInit();
      return this.initPromise;
    }

    async _doInit() {
      try {
        await this.waitForThreeJS();
        await this.loadGLTFLoader();
        await this.waitForGLTFLoader();
        
        // シーン作成
        this.scene = new THREE.Scene();
        
        // カメラ設定
        this.camera = new THREE.PerspectiveCamera(75, 480/360, 0.1, 1000);
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, 0);
        
        // レンダラー設定
        this.renderer = new THREE.WebGLRenderer({ 
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true
        });
        this.renderer.setSize(480, 360);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // デフォルトライト追加（明るさ調整）
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
        directionalLight.position.set(1, 1, 1);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        this.lights.set(1, directionalLight);
        
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        this.lights.set(2, ambientLight);
        this.nextLightId = 3;
        
        this.isInitialized = true;
        
        // 改良されたオーバーレイ設定
        this.setupImprovedOverlay();
        this.animate();
        
        console.log('3D extension initialized successfully');
      } catch (error) {
        console.error('3D initialization error:', error);
        this.initPromise = null;
        throw error;
      }
    }

    setupImprovedOverlay() {
      this.findAndSetupStageElement();
      
      this.container = document.createElement('div');
      this.container.style.position = 'absolute';
      this.container.style.top = '0';
      this.container.style.left = '0';
      this.container.style.width = '100%';
      this.container.style.height = '100%';
      this.container.style.pointerEvents = 'none';
      this.container.style.zIndex = '10';
      this.container.style.overflow = 'hidden';
      
      // レンダラーのcanvasにスタイルを適用
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
      this.renderer.domElement.style.display = 'block';
      
      this.container.appendChild(this.renderer.domElement);
      
      if (this.stageElement) {
        // ステージ要素の親に追加
        const parent = this.stageElement.parentElement || this.stageElement.parentNode;
        if (parent) {
          parent.style.position = 'relative';
          parent.appendChild(this.container);
        } else {
          document.body.appendChild(this.container);
        }
      } else {
        document.body.appendChild(this.container);
      }
      
      // 改良されたサイズ監視を開始
      this.startImprovedSizeMonitoring();
      
      console.log('Improved overlay setup complete');
    }

    findAndSetupStageElement() {
      // TurboWarp固有のセレクターを含む、より包括的な検索
      const selectors = [
        // TurboWarp特有
        '.stage-wrapper_stage-wrapper_2bejr canvas',
        '.stage-wrapper_stage-canvas_1aVgs',
        'div[class*="stage-wrapper"] canvas',
        'div[class*="stage"] canvas',
        
        // 一般的なScratch関連
        'canvas[class*="stage"]',
        'canvas[class*="Stage"]',
        '.stage canvas',
        '.Stage canvas',
        '#stage canvas',
        
        // フォールバック
        'canvas',
        'div[class*="stage"]',
        'div[class*="Stage"]',
        '.renderer canvas',
        '#app canvas'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          // キャンバス要素で、ある程度のサイズがあるものを検索
          if (element.tagName === 'CANVAS') {
            const rect = element.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) {
              this.stageCanvas = element;
              this.stageElement = element;
              console.log('Stage canvas found:', selector, `${rect.width}x${rect.height}`);
              return true;
            }
          } else if (element.querySelector('canvas')) {
            // div内のcanvasを検索
            const canvas = element.querySelector('canvas');
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) {
              this.stageCanvas = canvas;
              this.stageElement = element;
              console.log('Stage canvas found in div:', selector, `${rect.width}x${rect.height}`);
              return true;
            }
          }
        }
      }
      
      console.warn('Stage element not found, using fallback method');
      
      // フォールバック：最大のキャンバス要素を使用
      const allCanvases = document.querySelectorAll('canvas');
      let largestCanvas = null;
      let largestArea = 0;
      
      for (const canvas of allCanvases) {
        const rect = canvas.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > largestArea && area > 10000) { // 最小サイズチェック
          largestArea = area;
          largestCanvas = canvas;
        }
      }
      
      if (largestCanvas) {
        this.stageCanvas = largestCanvas;
        this.stageElement = largestCanvas;
        console.log('Using largest canvas as fallback:', `${largestCanvas.width}x${largestCanvas.height}`);
        return true;
      }
      
      this.stageElement = document.body;
      return false;
    }

    startImprovedSizeMonitoring() {
      // ResizeObserverが利用可能な場合は使用
      if (window.ResizeObserver && this.stageCanvas) {
        this.resizeObserver = new ResizeObserver((entries) => {
          this.updateSizeAndPosition();
        });
        
        // ステージキャンバスとその親要素を監視
        this.resizeObserver.observe(this.stageCanvas);
        if (this.stageCanvas.parentElement) {
          this.resizeObserver.observe(this.stageCanvas.parentElement);
        }
      }
      
      // インターバルによる定期チェックも継続（フォールバック）
      this.positionUpdateInterval = setInterval(() => {
        this.updateSizeAndPosition();
      }, 100);
      
      // ウィンドウリサイズイベント
      window.addEventListener('resize', () => {
        setTimeout(() => this.updateSizeAndPosition(), 50);
      });
      
      // MutationObserverでDOMの変更を監視
      if (window.MutationObserver) {
        const observer = new MutationObserver((mutations) => {
          let shouldUpdate = false;
          for (const mutation of mutations) {
            if (mutation.type === 'attributes' && 
                (mutation.attributeName === 'style' || 
                 mutation.attributeName === 'class')) {
              shouldUpdate = true;
              break;
            }
          }
          if (shouldUpdate) {
            setTimeout(() => this.updateSizeAndPosition(), 10);
          }
        });
        
        if (this.stageCanvas) {
          observer.observe(this.stageCanvas, {
            attributes: true,
            attributeFilter: ['style', 'class']
          });
          
          if (this.stageCanvas.parentElement) {
            observer.observe(this.stageCanvas.parentElement, {
              attributes: true,
              attributeFilter: ['style', 'class']
            });
          }
        }
      }
      
      // 初回更新
      setTimeout(() => this.updateSizeAndPosition(), 100);
    }

    updateSizeAndPosition() {
      if (!this.renderer || !this.camera || !this.container) return;
      
      let width = 480;
      let height = 360;
      let rect = null;
      
      if (this.stageCanvas) {
        rect = this.stageCanvas.getBoundingClientRect();
        
        // 実際の表示サイズを取得（CSSによる変形も考慮）
        width = rect.width;
        height = rect.height;
        
        // 最小サイズを設定
        width = Math.max(width, 100);
        height = Math.max(height, 100);
        
        // 内部解像度とCSS表示サイズを別々に管理
        const devicePixelRatio = window.devicePixelRatio || 1;
        const internalWidth = Math.floor(width * devicePixelRatio);
        const internalHeight = Math.floor(height * devicePixelRatio);
        
        // レンダラーの内部解像度を更新
        this.renderer.setSize(internalWidth, internalHeight, false);
        
        // CSS表示サイズを設定
        this.renderer.domElement.style.width = width + 'px';
        this.renderer.domElement.style.height = height + 'px';
        
        console.log(`3D canvas size updated: ${width}x${height} (internal: ${internalWidth}x${internalHeight})`);
      } else {
        // フォールバック：デフォルトサイズ
        this.renderer.setSize(width, height);
        this.renderer.domElement.style.width = width + 'px';
        this.renderer.domElement.style.height = height + 'px';
      }
      
      // カメラのアスペクト比を更新
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      
      // コンテナのサイズを更新
      this.container.style.width = width + 'px';
      this.container.style.height = height + 'px';
      
      // 位置の更新
      if (rect && this.stageCanvas) {
        const stageParent = this.stageCanvas.parentElement;
        if (stageParent && this.container.parentElement === stageParent) {
          // 同一親要素内なので相対位置
          const parentRect = stageParent.getBoundingClientRect();
          this.container.style.position = 'absolute';
          this.container.style.top = (rect.top - parentRect.top) + 'px';
          this.container.style.left = (rect.left - parentRect.left) + 'px';
        } else {
          // 異なる親要素の場合は固定位置
          this.container.style.position = 'fixed';
          this.container.style.top = rect.top + 'px';
          this.container.style.left = rect.left + 'px';
        }
      }
    }

    animate() {
      if (!this.isInitialized || !this.enable3D) return;
      
      this.animationId = requestAnimationFrame(() => this.animate());
      
      // カスタム合成が有効な場合
      if (this.startCustomComposition && this.replacementCanvas) {
        this.performCustomComposition();
      }
      
      // 通常のレンダリング
      this.renderer.render(this.scene, this.camera);
    }

    performCustomComposition() {
      if (!this.replacementContext || !this.stageCanvas) return;
      
      try {
        const width = this.replacementCanvas.width;
        const height = this.replacementCanvas.height;
        
        // 合成キャンバスをクリア
        this.replacementContext.clearRect(0, 0, width, height);
        
        // 1. 3Dを先に描画（背景）
        this.replacementContext.drawImage(this.renderer.domElement, 0, 0, width, height);
        
        // 2. Scratchステージを上に重ねて描画
        this.replacementContext.globalCompositeOperation = 'source-over';
        
        // ステージキャンバスから画像データを取得
        try {
          // 一時的にステージキャンバスを表示
          this.stageCanvas.style.visibility = 'visible';
          
          // 少し遅延してからキャプチャ
          setTimeout(() => {
            if (this.replacementContext && this.stageCanvas) {
              this.replacementContext.drawImage(this.stageCanvas, 0, 0, width, height);
              this.stageCanvas.style.visibility = 'hidden';
            }
          }, 16); // 1フレーム分の遅延
          
        } catch (error) {
          // エラーは無視して続行
        }
        
        this.replacementContext.globalCompositeOperation = 'source-over';
        
      } catch (error) {
        console.warn('Custom composition error:', error);
      }
    }

    renderComposite() {
      if (!this.compositeCanvas || !this.compositeContext || !this.stageCanvas) {
        return;
      }
      
      try {
        const width = this.compositeCanvas.width;
        const height = this.compositeCanvas.height;
        
        // 合成キャンバスをクリア
        this.compositeContext.clearRect(0, 0, width, height);
        
        // 3Dシーンをレンダリング
        this.renderer.render(this.scene, this.camera);
        
        if (this.compositeDepth === 'back') {
          // 3D → Scratchの順序で描画（3Dが背景）
          this.compositeContext.drawImage(this.renderer.domElement, 0, 0, width, height);
          this.compositeContext.globalCompositeOperation = 'source-over';
          this.compositeContext.drawImage(this.stageCanvas, 0, 0, width, height);
          
        } else if (this.compositeDepth === 'behind') {
          // 3D → Scratchの順序で描画（3Dがスプライトの後ろ）
          this.compositeContext.drawImage(this.renderer.domElement, 0, 0, width, height);
          this.compositeContext.globalCompositeOperation = 'source-over';
          this.compositeContext.globalAlpha = 0.95; // 少し透明にしてブレンド
          this.compositeContext.drawImage(this.stageCanvas, 0, 0, width, height);
          this.compositeContext.globalAlpha = 1.0;
        }
        
        // 合成操作をリセット
        this.compositeContext.globalCompositeOperation = 'source-over';
        
      } catch (error) {
        console.warn('Composite rendering error:', error);
      }
    }

    async addCube(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const size = Scratch.Cast.toNumber(args.SIZE);
      const color = args.COLOR;
      
      const geometry = new THREE.BoxGeometry(size, size, size);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 1
      });
      const cube = new THREE.Mesh(geometry, material);
      cube.castShadow = true;
      cube.receiveShadow = true;
      
      this.scene.add(cube);
      const id = this.nextObjectId++;
      this.objects.set(id, cube);
      
      console.log(`立方体を追加しました (ID: ${id})`);
    }

    async addSphere(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const radius = Scratch.Cast.toNumber(args.RADIUS);
      const color = args.COLOR;
      
      const geometry = new THREE.SphereGeometry(radius, 32, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 1
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      
      this.scene.add(sphere);
      const id = this.nextObjectId++;
      this.objects.set(id, sphere);
      
      console.log(`球体を追加しました (ID: ${id})`);
    }

    async addCylinder(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const radius = Scratch.Cast.toNumber(args.RADIUS);
      const height = Scratch.Cast.toNumber(args.HEIGHT);
      const color = args.COLOR;
      
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 1
      });
      const cylinder = new THREE.Mesh(geometry, material);
      cylinder.castShadow = true;
      cylinder.receiveShadow = true;
      
      this.scene.add(cylinder);
      const id = this.nextObjectId++;
      this.objects.set(id, cylinder);
      
      console.log(`円柱を追加しました (ID: ${id})`);
    }

    async addPlane(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const width = Scratch.Cast.toNumber(args.WIDTH);
      const height = Scratch.Cast.toNumber(args.HEIGHT);
      const color = args.COLOR;
      
      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshPhongMaterial({ 
        color: parseInt(color.slice(1), 16),
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(geometry, material);
      plane.castShadow = true;
      plane.receiveShadow = true;
      
      this.scene.add(plane);
      const id = this.nextObjectId++;
      this.objects.set(id, plane);
      
      console.log(`平面を追加しました (ID: ${id})`);
    }

    async addModel(args, util) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined' || !this.GLTFLoader) return;
      
      const url = Scratch.Cast.toString(args.URL);
      const scale = Scratch.Cast.toNumber(args.SCALE);
      const colorOption = Scratch.Cast.toString(args.COLOR);
      const opacity = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.OPACITY)));
      const brightness = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.BRIGHTNESS)));
      
      try {
        const loader = new this.GLTFLoader();
        const gltf = await new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });
        
        const model = gltf.scene;
        model.scale.set(scale, scale, scale);
        
        // マテリアル処理
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material.transparent = opacity < 1;
            child.material.opacity = opacity;
            child.material.emissive = new THREE.Color(brightness, brightness, brightness);
            if (colorOption === 'custom') {
              const color = util ? util.target.getField('COLOR') : '#ffffff';
              child.material.color.setHex(parseInt(color.slice(1), 16));
            }
          }
        });
        
        this.scene.add(model);
        const id = this.nextObjectId++;
        this.objects.set(id, model);
        
        console.log(`モデルを追加しました (ID: ${id}, URL: ${url}, 透明度: ${opacity}, 明るさ: ${brightness})`);
      } catch (error) {
        console.error(`モデル読み込みエラー: ${url}`, error);
      }
    }

    setObjectPosition(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      obj.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    moveObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      obj.position.x += Scratch.Cast.toNumber(args.X);
      obj.position.y += Scratch.Cast.toNumber(args.Y);
      obj.position.z += Scratch.Cast.toNumber(args.Z);
    }

    setObjectRotation(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      obj.rotation.x = Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      obj.rotation.y = Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      obj.rotation.z = Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
    }

    rotateObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      obj.rotation.x += Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      obj.rotation.y += Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      obj.rotation.z += Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
    }

    setObjectScale(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      obj.scale.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    setObjectColor(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      const color = args.COLOR;
      if (obj.material) {
        obj.material.color.setHex(parseInt(color.slice(1), 16));
      } else {
        // モデルがグループの場合、子要素に適用
        obj.traverse((child) => {
          if (child.material) {
            child.material.color.setHex(parseInt(color.slice(1), 16));
          }
        });
      }
    }

    setObjectOpacity(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      const opacity = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.OPACITY)));
      if (obj.material) {
        obj.material.opacity = opacity;
        obj.material.transparent = opacity < 1;
      } else {
        // モデルがグループの場合、子要素に適用
        obj.traverse((child) => {
          if (child.material) {
            child.material.opacity = opacity;
            child.material.transparent = opacity < 1;
          }
        });
      }
    }

    setObjectBrightness(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      const brightness = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.BRIGHTNESS)));
      if (obj.material) {
        obj.material.emissive = new THREE.Color(brightness, brightness, brightness);
      } else {
        // モデルがグループの場合、子要素に適用
        obj.traverse((child) => {
          if (child.material) {
            child.material.emissive = new THREE.Color(brightness, brightness, brightness);
          }
        });
      }
    }

    removeObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      this.scene.remove(obj);
      
      // ジオメトリとマテリアルを削除（モデル対応）
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      
      // Mapから削除
      this.objects.delete(id);
      console.log(`オブジェクト ${id} を削除しました`);
    }

    setCameraPosition(args) {
      if (!this.isInitialized) return;
      
      this.camera.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    moveCamera(args) {
      if (!this.isInitialized) return;
      
      this.camera.position.x += Scratch.Cast.toNumber(args.X);
      this.camera.position.y += Scratch.Cast.toNumber(args.Y);
      this.camera.position.z += Scratch.Cast.toNumber(args.Z);
    }

    setCameraRotation(args) {
      if (!this.isInitialized) return;
      
      this.camera.rotation.x = Scratch.Cast.toNumber(args.X) * (Math.PI/180);
      this.camera.rotation.y = Scratch.Cast.toNumber(args.Y) * (Math.PI/180);
      this.camera.rotation.z = Scratch.Cast.toNumber(args.Z) * (Math.PI/180);
    }

    lookAtObject(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return;
      
      this.camera.lookAt(obj.position);
    }

    lookAtPosition(args) {
      if (!this.isInitialized) return;
      
      this.camera.lookAt(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    set3DDepth(args) {
      const depth = args.DEPTH;
      
      if (!this.container) return;
      
      switch (depth) {
        case 'front':
          this.container.style.zIndex = '9999';
          console.log('3Dを最前面に設定');
          break;
        case 'back':
          this.container.style.zIndex = '1';
          console.log('3Dを最背面に設定');
          break;
        case 'behind':
          this.container.style.zIndex = '5';
          console.log('3Dをスプライトの後ろに設定');
          break;
        default:
          this.container.style.zIndex = '10';
      }
    }

    set3DOpacity(args) {
      const opacity = Math.max(0, Math.min(1, Scratch.Cast.toNumber(args.OPACITY)));
      this.current3DOpacity = opacity;
      
      if (this.container) {
        this.container.style.opacity = opacity.toString();
      }
      
      console.log('3D透明度を設定:', opacity);
    }

    setBlendMode(args) {
      const modeMap = {
        'normal': 'normal',
        'multiply': 'multiply',
        'screen': 'screen',
        'overlay': 'overlay',
        'soft-light': 'soft-light',
        'hard-light': 'hard-light',
        'difference': 'difference',
        'exclusion': 'exclusion'
      };
      
      const mode = modeMap[args.MODE] || 'normal';
      this.currentBlendMode = mode;
      
      if (this.container) {
        this.container.style.mixBlendMode = mode;
      }
      
      console.log('合成モードを設定:', mode);
    }

    enable3DRendering(args) {
      const enable = args.ENABLE === 'on';
      this.enable3D = enable;
      
      if (this.container) {
        this.container.style.display = enable ? 'block' : 'none';
      }
      
      if (enable && this.isInitialized) {
        this.resume3D();
      } else {
        this.pause3D();
      }
      
      console.log('3D描画:', enable ? 'オン' : 'オフ');
    }

    async addLight(args) {
      await this.init();
      if (!this.isInitialized || typeof THREE === 'undefined') return;
      
      const type = args.TYPE;
      const color = parseInt(args.COLOR.slice(1), 16);
      const intensity = Scratch.Cast.toNumber(args.INTENSITY);
      
      let light;
      
      switch (type) {
        case 'directional':
          light = new THREE.DirectionalLight(color, intensity);
          light.position.set(1, 1, 1);
          light.castShadow = true;
          break;
        case 'point':
          light = new THREE.PointLight(color, intensity, 100);
          light.position.set(0, 0, 0);
          light.castShadow = true;
          break;
        case 'ambient':
          light = new THREE.AmbientLight(color, intensity);
          break;
        default:
          return;
      }
      
      this.scene.add(light);
      const id = this.nextLightId++;
      this.lights.set(id, light);
      
      console.log(`${type}ライトを追加しました (ID: ${id})`);
    }

    setLightPosition(args) {
      if (!this.isInitialized) return;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const light = this.lights.get(id);
      if (!light || !light.position) return;
      
      light.position.set(
        Scratch.Cast.toNumber(args.X),
        Scratch.Cast.toNumber(args.Y),
        Scratch.Cast.toNumber(args.Z)
      );
    }

    getObjectCount() {
      return this.objects.size;
    }

    getLastObjectId() {
      return this.nextObjectId - 1;
    }

    getObjectPosition(args) {
      if (!this.isInitialized) return 0;
      
      const id = Scratch.Cast.toNumber(args.ID);
      const obj = this.objects.get(id);
      if (!obj) return 0;
      
      const axis = args.AXIS;
      
      switch (axis) {
        case 'x': return obj.position.x;
        case 'y': return obj.position.y;
        case 'z': return obj.position.z;
        default: return 0;
      }
    }

    getCameraPosition(args) {
      if (!this.isInitialized) return 0;
      
      const axis = args.AXIS;
      
      switch (axis) {
        case 'x': return this.camera.position.x;
        case 'y': return this.camera.position.y;
        case 'z': return this.camera.position.z;
        default: return 0;
      }
    }

    clearScene() {
      if (!this.isInitialized) return;
      
      // すべてのオブジェクトを削除
      for (const [id, obj] of this.objects) {
        this.scene.remove(obj);
        obj.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
      this.objects.clear();
      this.nextObjectId = 1;
      
      // カスタムライト削除（デフォルトライト以外）
      for (const [id, light] of this.lights) {
        if (id > 2) { // デフォルトライトのID 1,2 以外
          this.scene.remove(light);
        }
      }
      
      // デフォルトライトのみ残す
      const defaultLights = new Map();
      if (this.lights.has(1)) defaultLights.set(1, this.lights.get(1));
      if (this.lights.has(2)) defaultLights.set(2, this.lights.get(2));
      this.lights = defaultLights;
      this.nextLightId = 3;
      
      console.log('3D scene cleared');
    }

    pause3D() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      if (this.positionUpdateInterval) {
        clearInterval(this.positionUpdateInterval);
        this.positionUpdateInterval = null;
      }
      console.log('3D rendering paused');
    }

    resume3D() {
      if (!this.animationId && this.isInitialized && this.enable3D) {
        this.animate();
      }
      if (!this.positionUpdateInterval) {
        this.startImprovedSizeMonitoring();
      }
      console.log('3D rendering resumed');
    }

    // クリーンアップメソッド
    dispose() {
      this.pause3D();
      
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      
      if (this.renderer) {
        this.renderer.dispose();
      }
      
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      
      this.clearScene();
      
      // アセットもクリア
      this.modelAssets.clear();
      this.nextAssetId = 1;
      
      window.removeEventListener('resize', this.updateSizeAndPosition);
      
      this.isInitialized = false;
      this.initPromise = null;
      
      console.log('3D extension disposed');
    }
  }

  // 拡張機能を登録
  Scratch.extensions.register(new ThreeDExtension());
})(Scratch);
