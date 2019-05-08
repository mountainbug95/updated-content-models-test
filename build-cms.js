const contentful = require('contentful');
const matter = require('gray-matter');
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const yaml = require('js-yaml');

const spaceId = process.env['CONTENTFUL_SPACE_ID'];
const accessToken = process.env['CONTENTFUL_DEPLOY_TOKEN'];
const outputDir = __dirname;
const dataFilesDir = '_data';

if (!spaceId || !accessToken) {
    throw 'Need contentful-space-id and contentful-access-token arguments';
}

function createPageFiles(pages) {
    pages.forEach(page => {
        const filePath = getPageFilePath(page);
        const filteredFrontmatter = _.omit(page, ['content', 'stackbit_url_path']);
        const fileContent = matter.stringify(page.content || '', filteredFrontmatter);
        const outputPath = path.join(outputDir, filePath);
        fse.outputFileSync(outputPath, fileContent);
        console.log(`Contentful: created page file ${filePath}.`);
    });
}

function createDataFiles(dataFiles) {
    dataFiles.forEach(dataFile => {
        const filePath = dataFile.stackbit_file_path;
        const data = _.omit(dataFile, ['stackbit_file_path']);
        const fileContent = convertDataByFilePath(data, filePath);
        const outputPath = path.join(outputDir, dataFilesDir, filePath);
        fse.outputFileSync(outputPath, fileContent);
        console.log(`Contentful: created data file ${filePath}.`);
    });
}

function createConfig(configData) {
    const filePath = configData.stackbit_file_path;
    const data = _.omit(configData, ['stackbit_file_path']);
    const fileContent = convertDataByFilePath(data, filePath);
    const outputPath = path.join(outputDir, filePath);
    fse.outputFileSync(outputPath, fileContent);
    console.log(`Contentful: created config file ${filePath}.`);
}

function convertDataByFilePath(data, filePath) {
    const extension = path.extname(filePath).substring(1);
    let result;
    switch (extension) {
        case 'yml':
        case 'yaml':
            result = yaml.safeDump(data);
            break;
        case 'json':
            result = JSON.stringify(data);
            break;
        default:
            throw new Error(`Build error, data file '${filePath}' could not be created, extension '${extension}' is not supported`);
    }
    return result;
}

function getPageFilePath(page) {
    let url = page.stackbit_url_path;
    if (url.match(/^posts/)) {
        url = url.replace(/^posts\//, '_posts/');
        let urlParts = url.split('/');
        url = urlParts[0] + '/' + new Date(page.date).toISOString().substr(0, 10) + '-' + urlParts[1].replace(/[_]/, '-');
    }
    return url.replace(/.html$/, '.md');
}

function filterEntries(entries) {
    const pageEntries = _.filter(entries.items, {fields: {stackbit_model_type: 'page'}});
    const dataEntries = _.filter(entries.items, {fields: {stackbit_model_type: 'data'}});
    const configEntry = _.find(entries.items, {fields: {stackbit_model_type: 'config'}});
    const filteredPageEntries = filterAndTransformProperties(pageEntries);
    const filteredConfigEntry = filterAndTransformProperties(configEntry);
    const filteredDataEntries = filterAndTransformProperties(dataEntries);
    return {
        config: filteredConfigEntry,
        pages: filteredPageEntries,
        data: filteredDataEntries
    };
}

function filterAndTransformProperties(entries) {
    return deepMap(entries, (obj) => {
        if (_.get(obj, 'sys.type') === "Asset") {
            return _.get(obj, 'fields.file.url').replace(/^\/\//, 'https:\/\/');
        }
        let unwrapped = (obj && obj.sys && obj.fields) ? obj.fields : obj;
        let filteredObj = _.isPlainObject(unwrapped) ? _.omit(unwrapped, 'stackbit_model_type') : unwrapped;
        return filteredObj;
    });
}

function deepMap(node, iterator, context) {
    let rt = iterator.call(context, node);

    if (_.isPlainObject(rt)) {
        return _.mapValues(rt, value => deepMap(value, iterator, context));
    } else if (_.isArray(rt)) {
        return _.map(rt, value => deepMap(value, iterator, context));
    } else {
        return rt;
    }
}

console.log(`Contentful: downloading content from space ${spaceId}`);

contentful.createClient({
    accessToken: accessToken,
    space: spaceId
}).getEntries().then(entries => {
    return filterEntries(entries);
}).then(data => {
    createPageFiles(data.pages);
    createDataFiles(data.data);
    createConfig(data.config);
}).catch(err => {
    console.error('Build-CMS failed', err);
    process.exit(1);
});
