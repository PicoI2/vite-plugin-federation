import type { PluginHooks } from '../../types/pluginHooks'
import type { VitePluginFederationOptions } from 'types'
import download from 'download'
import { execSync } from 'child_process'
import { cpSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { builderInfo } from '../public'

export function federationTypesPlugin(
  options: VitePluginFederationOptions
): PluginHooks {
  return {
    name: 'vite-module-federation-types-plugin',

    async buildStart() {
      // Download types of remotes
      if (
        options.mode !== 'production' &&
        typeof options.remotes === 'object' &&
        options.downloadFederatedTypes
      ) {
        for (const [name, entryUrl] of Object.entries(options.remotes)) {
          const typesUrl = entryUrl.replace(/\/[^/]+$/, '/@types/index.d.ts')

          try {
            const data = await download(
              typesUrl,
              `./src/@types/remotes/${name}/`,
              {
                filename: 'index.d.ts.temp'
              }
            )
            const startOfFile = data.subarray(0, 15)
            if (startOfFile == '/// <reference ') {
              // types files starts like that
              renameSync(
                `./src/@types/remotes/${name}/index.d.ts.temp`,
                `./src/@types/remotes/${name}/index.d.ts`
              )
            } else {
              unlinkSync(`./src/@types/remotes/${name}/index.d.ts.temp`)
            }
          } catch (e: any) {
            console.error(
              `\ndownload of types from '${name}' (${typesUrl}) failed`
            )
          }
        }
      }

      // Build self types
      if (
        options.exposes &&
        options.mode !== 'production' &&
        options.makeFederatedTypes
      ) {
        if (!existsSync('node_modules')) {
          mkdirSync('node_modules')
        }
        // this command fail if
        // - type: "module" in package.json
        // - there is not "node_modules" in current directory
        execSync(
          'npx make-federated-types -c modulefederation.config.js -o public/@types',
          { stdio: 'inherit' }
        )
        cpSync(
          'public/@types/index.d.ts',
          `${builderInfo.outDir}/@types/index.d.ts`
        )
      }
    }
  }
}
