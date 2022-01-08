// Copyright (c) 2021 The Brave Authors. All rights reserved.
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this file,
// you can obtain one at http://mozilla.org/MPL/2.0/.

const commander = require('commander')
const fs = require('fs-extra')
const mkdirp = require('mkdirp')
const path = require('path')
const replace = require('replace-in-file')
const util = require('../../lib/util')
const params = require('./params')

const stageFiles = (locale, version, outputDir) => {
  // Copy resources and manifest file to outputDir.
  // Copy resource files
  const resourceDir = path.join(path.resolve(), 'build', 'ntp-sponsored-images', 'resources', locale, '/')
  console.log('copy dir:', resourceDir, ' to:', outputDir)
  fs.copySync(resourceDir, outputDir)

  // Fix up the manifest version
  const originalManifestPath = getManifestPath(locale)
  const outputManifestPath = path.join(outputDir, 'manifest.json')
  console.log('copy manifest file: ', originalManifestPath, ' to: ', outputManifestPath)
  const replaceOptions = {
    files: outputManifestPath,
    from: /0\.0\.0/,
    to: version
  }
  fs.copyFileSync(originalManifestPath, outputManifestPath)
  // @ts-ignore typescript thinks were using es import syntax and expects replace.default.sync
  replace.sync(replaceOptions)
}

const generateManifestFile = (regionPlatform, componentData) => {
  const manifestPath = getManifestPath(regionPlatform)
  const manifestContent = {
    description: `Brave NTP sponsored images component (${regionPlatform})`,
    key: componentData.key,
    manifest_version: 2,
    name: 'Brave NTP sponsored images',
    version: '0.0.0'
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifestContent))
}

const getManifestsDir = () => {
  const targetResourceDir = path.join(path.resolve(), 'build', 'ntp-sponsored-images', 'manifiest-files')
  mkdirp.sync(targetResourceDir)
  return targetResourceDir
}

/**
 *
 *
 * @param {string} regionPlatform
 * @returns
 */
function getManifestPath (regionPlatform) {
  return path.join(getManifestsDir(), `${regionPlatform}-manifest.json`)
}

const generateCRXFile = (binary, endpoint, region, keyDir, platformRegion, componentData) => {
  const rootBuildDir = path.join(path.resolve(), 'build', 'ntp-sponsored-images')
  const stagingDir = path.join(rootBuildDir, 'staging', platformRegion)
  const crxOutputDir = path.join(rootBuildDir, 'output')
  mkdirp.sync(stagingDir)
  mkdirp.sync(crxOutputDir)
  util.getNextVersion(endpoint, region, componentData.id).then((version) => {
    const crxFile = path.join(crxOutputDir, `ntp-sponsored-images-${platformRegion}.crx`)
    // Desktop private key file names do not have the -desktop suffix, but android has -android
    const privateKeyFile = path.join(keyDir, `ntp-sponsored-images-${platformRegion.replace('-desktop', '')}.pem`)
    stageFiles(platformRegion, version, stagingDir)
    util.generateCRXFile(binary, crxFile, privateKeyFile, stagingDir)
    console.log(`Generated ${crxFile} with version number ${version}`)
  })
}

util.installErrorHandlers()

commander
  .option('-b, --binary <binary>', 'Path to the Chromium based executable to use to generate the CRX file')
  .option('-d, --keys-directory <dir>', 'directory containing private keys for signing crx files')
  .option('-e, --endpoint <endpoint>', 'DynamoDB endpoint to connect to', '')// If setup locally, use http://localhost:8000
  .option('-r, --region <region>', 'The AWS region to use', 'us-west-2')
  .option('-t, --target-regions <regions>', 'Comma separated list of regions that should generate SI component. For example: "AU-android,US-desktop,GB-ios"', '')
  .option('-u, --excluded-target-regions <regions>', 'Comma separated list of regions that should not generate SI component. For example: "AU-android,US-desktop,GB-ios"', '')
  .parse(process.argv)

let keyDir = ''
if (fs.existsSync(commander.keysDirectory)) {
  keyDir = commander.keysDirectory
} else {
  throw new Error('Missing or invalid private key directory')
}

if (!commander.binary) {
  throw new Error('Missing Chromium binary: --binary')
}

const targetComponents = params.getTargetComponents(commander.targetRegions, commander.excludedTargetRegions)

util.createTableIfNotExists(commander.endpoint, commander.region).then(() => {
  for (const platformRegion of Object.keys(targetComponents)) {
    const componentData = targetComponents[platformRegion]
    generateManifestFile(platformRegion, componentData)
    generateCRXFile(commander.binary, commander.endpoint, commander.region, keyDir, platformRegion, componentData)
  }
})
