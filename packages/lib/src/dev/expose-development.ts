// *****************************************************************************
// Copyright (C) 2022 Origin.js and others.
//
// This program and the accompanying materials are licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
// EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
// MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.
//
// SPDX-License-Identifier: MulanPSL-2.0
// *****************************************************************************

import { getModuleMarker, normalizePath, parseExposeOptions } from '../utils'
import { EXTERNALS, SHARED, builderInfo, parsedOptions } from '../public'
import type { VitePluginFederationOptions } from 'types'
import type { PluginHooks } from '../../types/pluginHooks'
import type { PluginContext } from 'rollup'
import { UserConfig, ViteDevServer } from 'vite'
import { importShared } from './import-shared'

export function devExposePlugin(
  options: VitePluginFederationOptions
): PluginHooks {
  parsedOptions.devExpose = parseExposeOptions(options)
  let pluginContext: PluginContext | undefined = undefined
  let baseDir = '/'
  let remoteFile = ''
  const getRemoteFile = async () => {
    if (!pluginContext) {
      console.error('Error trying to generate remoteEntry.js before build step')
      return ''
    }

    if (!remoteFile) {
      let moduleMap = ''

      // exposes module
      for (const item of parsedOptions.devExpose) {
        // We could have used directly 'item[1].import' but it does not work if filename has more than 1 dots (.)
        // Using pluginContext.resolve give us the complete filename (it can be without extension)
        const resolvedPath = await pluginContext.resolve(item[1].import)
        const fileName = resolvedPath.id.split('/').slice(-1)
        const moduleName = getModuleMarker(`\${${item[0]}}`, SHARED)
        EXTERNALS.push(moduleName)

        const importPath =
          normalizePath(item[1].import).split('/').slice(0, -1).join('/') +
          `/${fileName}`
        const exposeFilepath = resolvedPath.id
        pluginContext.addWatchFile(exposeFilepath)
        moduleMap += `\n"${item[0]}":() => {
          return __federation_import('/${importPath}', '${baseDir}@fs/${exposeFilepath}').then(module =>Object.keys(module).every(item => exportSet.has(item)) ? () => module.default : () => module)},`
      }

      remoteFile = `(${importShared})();
      const exportSet = new Set(['Module', '__esModule', 'default', '_export_sfc']);
      let moduleMap = {
        ${moduleMap}
      };
      const __federation_import = async (urlImportPath, fsImportPath) => {
        let importedModule;
        try {
          return await import(urlImportPath);
        }catch(ex) {
          return await import(fsImportPath)
        }
      };
      export const get =(module) => {
        if(!moduleMap[module]) throw new Error('Can not find remote module ' + module)
        return moduleMap[module]();
      };
      export const init =(shareScope) => {
        globalThis.__federation_shared__= globalThis.__federation_shared__|| {};
        Object.entries(shareScope).forEach(([key, value]) => {
          const versionKey = Object.keys(value)[0];
          const versionValue = Object.values(value)[0];
          const scope = versionValue.scope || 'default'
          globalThis.__federation_shared__[scope] = globalThis.__federation_shared__[scope] || {};
          const shared= globalThis.__federation_shared__[scope];
          (shared[key] = shared[key]||{})[versionKey] = versionValue;
        });
      }
    `
    }
    return remoteFile
  }

  return {
    name: 'originjs:expose-development',
    config: (config: UserConfig) => {
      if (config.base) {
        baseDir = config.base
      }
    },
    configureServer(server: ViteDevServer) {
      const remoteFilePath = `${builderInfo.assetsDir}/${options.filename}`
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.includes(remoteFilePath)) {
          const remoteFile = await getRemoteFile()
          res.writeHead(200, 'OK', {
            'Content-Type': 'text/javascript',
            'Access-Control-Allow-Origin': '*'
          })
          res.write(remoteFile)
          res.end()
        } else {
          next()
        }
      })
    },
    buildStart() {
      pluginContext = this
    }
  }
}
