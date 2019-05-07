const contentful = require('contentful');
const matter = require('gray-matter');
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');

if (!process.env['CONTENTFUL_SPACE_ID'] || !process.env['CONTENTFUL_DEPLOY_TOKEN']) {
    throw 'Need contentful-space-id and contentful-access-token arguments'
}

function fetch(spaceId, accessToken) {
    return contentful.createClient({
        accessToken: accessToken,
        space: spaceId
    }).getEntries().then(entries => {
        return filterEntries(entries);
    });
}

function createFiles(files, outputDir) {
    files.forEach(file => {
        let fileUrl = getFilePath(file);
        let fileFrontmatter = _.omit(file, 'content');
        let fileContent = matter.stringify(file.content || '', fileFrontmatter);
        fse.outputFileSync(path.join(outputDir, fileUrl), fileContent);
        console.log(`Contentful: created file ${fileUrl}. original file url: ${file.url}`);
    });
}

function getFilePath(file) {
    let url = file.url;
    
    if (url.match(/^posts/)) {
        url = url.replace(/^posts\//, '_posts/');
        let urlParts = url.split('/');
        url = urlParts[0] + '/' + new Date(file.date).toISOString().substr(0, 10) + '-' + urlParts[1].replace(/[_]/, '-');
    }
    return url.replace(/.html$/, '.md');
}

function filterEntries(entries) {
    const pageEntries = _.filter(entries.items, {fields: {stackbit_model_type: 'page'}});
    return deepMap(pageEntries, (obj) => {
        return (obj && obj.sys && obj.fields) ? _.omit(obj.fields, 'stackbit_model_type') : obj
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

console.log(`Contentful: downloading content from space ${process.env['CONTENTFUL_SPACE_ID']}`);
fetch(process.env['CONTENTFUL_SPACE_ID'], process.env['CONTENTFUL_DEPLOY_TOKEN']).then(files => {
    return createFiles(files, __dirname);
}).catch(err => {
    console.error('err', err);
    throw err;
});
