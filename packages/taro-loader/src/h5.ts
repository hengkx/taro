import { readConfig } from '@tarojs/helper'
import { AppConfig } from '@tarojs/taro'
import { IH5Config } from '@tarojs/taro/types/compile'
import { getOptions, stringifyRequest } from 'loader-utils'
import { dirname, join } from 'path'
import type * as webpack from 'webpack'

function genResource (path: string, pages: Map<string, string>, loaderContext: webpack.LoaderContext<any>, syncFileName: string | false = false) {
  const stringify = (s: string): string => stringifyRequest(loaderContext, s)
  const importDependent = syncFileName ? 'require' : 'import'
  return `Object.assign({
  path: '${path}',
  load: function(context, params) {
    const page = ${importDependent}(${stringify(join(loaderContext.context, syncFileName || path))})
    return [page, context, params]
  }
}, ${JSON.stringify(readConfig(pages.get(path)!))})`
}

export default function (this: webpack.LoaderContext<any>) {
  const options = getOptions(this)
  const stringify = (s: string): string => stringifyRequest(this, s)
  const {
    importFrameworkStatement,
    frameworkArgs,
    creator,
    creatorLocation,
    importFrameworkName,
    extraImportForWeb,
    execBeforeCreateWebApp,
    compatComponentImport,
    compatComponentExtra
  } = options.loaderMeta
  const config: AppConfig & IH5Config = options.config
  const pages: Map<string, string> = options.pages
  const routerMode = config?.router?.mode || 'hash'
  const isMultiRouterMode = routerMode === 'multi'
  const pxTransformConfig = options.pxTransformConfig

  const pageName = isMultiRouterMode ? join(dirname(this.resourcePath), options.name).replace(options.sourceDir + '/', '') : ''
  if (options.bootstrap) return `import(${stringify(join(options.sourceDir, `${isMultiRouterMode ? pageName : options.entryFileName}.boot`))})`

  let tabBarCode = `var tabbarIconPath = []
var tabbarSelectedIconPath = []
`
  if (config.tabBar) {
    const tabbarList = config.tabBar.list
    for (let i = 0; i < tabbarList.length; i++) {
      const t = tabbarList[i]
      if (t.iconPath) {
        const iconPath = stringify(join(dirname(this.resourcePath), t.iconPath))
        tabBarCode += `tabbarIconPath[${i}] = typeof require(${iconPath}) === 'object' ? require(${iconPath}).default : require(${iconPath})\n`
      }
      if (t.selectedIconPath) {
        const iconPath = stringify(join(dirname(this.resourcePath), t.selectedIconPath))
        tabBarCode += `tabbarSelectedIconPath[${i}] = typeof require(${iconPath}) === 'object' ? require(${iconPath}).default : require(${iconPath})\n`
      }
    }
  }

  const webComponents = `
import { defineCustomElements, applyPolyfills } from '@tarojs/components/loader'
import '@tarojs/components/dist/taro-components/taro-components.css'
${extraImportForWeb || ''}
applyPolyfills().then(function () {
  defineCustomElements(window)
})
`

  const components = options.useHtmlComponents ? compatComponentImport || '' : webComponents
  const routesConfig = isMultiRouterMode ? `config.routes = []
config.route = ${genResource(pageName, pages, this, options.name)}
config.pageName = "${pageName}"` : `config.routes = [
  ${config.pages?.map(path => genResource(path, pages, this)).join(',')}
]`
  const routerCreator = isMultiRouterMode ? 'createMultiRouter' : 'createRouter'

  const code = `import { initPxTransform } from '@tarojs/taro'
import { ${routerCreator} } from '@tarojs/router'
import component from ${stringify(join(options.sourceDir, options.entryFileName))}
import { window } from '@tarojs/runtime'
import { ${creator} } from '${creatorLocation}'
var config = ${JSON.stringify(config)}
${importFrameworkStatement}
${components}
window.__taroAppConfig = config
${config.tabBar ? tabBarCode : ''}
if (config.tabBar) {
  var tabbarList = config.tabBar.list
  for (var i = 0; i < tabbarList.length; i++) {
    var t = tabbarList[i]
    if (t.iconPath) {
      t.iconPath = tabbarIconPath[i]
    }
    if (t.selectedIconPath) {
      t.selectedIconPath = tabbarSelectedIconPath[i]
    }
  }
}
${routesConfig}
${options.useHtmlComponents ? compatComponentExtra : ''}
${execBeforeCreateWebApp || ''}
var inst = ${creator}(component, ${frameworkArgs})
${routerCreator}(inst, config, ${importFrameworkName})
initPxTransform({
  designWidth: ${pxTransformConfig.designWidth},
  deviceRatio: ${JSON.stringify(pxTransformConfig.deviceRatio)}
})
`
  return code
}
