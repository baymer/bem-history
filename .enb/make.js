var DEFAULT_LANGS = ['ru', 'en'],
    fs = require('fs'),
    path = require('path'),
    naming = require('bem-naming'),
    levels = require('enb-bem/techs/levels'),
    provide = require('enb/techs/file-provider'),
    bemdeclFromDepsByTech = require('enb-bem/techs/bemdecl-from-deps-by-tech'),
    bemdecl = require('enb-bem/techs/bemdecl-from-bemjson'),
    deps = require('enb-bem/techs/deps-old'),
    files = require('enb-bem/techs/files'),
    css = require('enb-stylus/techs/css-stylus'),
    js = require('enb-diverse-js/techs/browser-js'),
    ym = require('enb-modules/techs/prepend-modules'),
    bemhtml = require('enb-bemxjst/techs/bemhtml-old'),
    html = require('enb-bemxjst/techs/html-from-bemjson'),
    bh = require('enb-bh/techs/bh-server'),
    bhHtml = require('enb-bh/techs/html-from-bemjson'),
    copyFile = require('enb/techs/file-copy'),
    mergeFiles = require('enb/techs/file-merge'),
    borschik = require('enb-borschik/techs/borschik'),
    PLATFORMS = {
        'desktop' : ['common']
    };

module.exports = function(config) {
    var platforms = ['desktop'],
        langs = process.env.BEM_I18N_LANGS;

    config.includeConfig('enb-bem-examples');
    config.includeConfig('enb-bem-docs');
    config.includeConfig('enb-bem-specs');

    config.setLanguages(langs? langs.split(' ') : [].concat(DEFAULT_LANGS));

    configurePages(platforms);
    configureSets(platforms, {
        tests : config.module('enb-bem-examples').createConfigurator('tests'),
        examples : config.module('enb-bem-examples').createConfigurator('examples'),
        docs : config.module('enb-bem-docs').createConfigurator('docs', 'examples'),
        specs : config.module('enb-bem-specs').createConfigurator('specs')
    });

    function configurePages(platforms) {
        platforms.forEach(function(platform) {
            var nodes = [platform + '.tests/*/*', platform + '.examples/*/*'];

            configureLevels(platform, nodes);

            config.nodes(nodes, function(nodeConfig) {
                var langs = config.getLanguages();

                // Base techs
                nodeConfig.addTechs([
                    [bemdecl],
                    [deps],
                    [files]
                ]);

                // Client techs
                nodeConfig.addTechs([
                    [css, { target : '?.css' }],
                    [js],
                    [mergeFiles, {
                        target : '?.pre.js',
                        sources : ['?.browser.bemhtml.js', '?.browser.js']
                    }],
                    [ym, {
                        source : '?.pre.js',
                        target : '?.js'
                    }]
                ]);

                // Client BEMHTML
                nodeConfig.addTechs([
                    [bemdeclFromDepsByTech, {
                        target : '?.bemhtml.bemdecl.js',
                        sourceTech : 'js',
                        destTech : 'bemhtml'
                    }],
                    [deps, {
                        target : '?.bemhtml.deps.js',
                        sourceDepsFile : '?.bemhtml.bemdecl.js'
                    }],
                    [files, {
                        target : '?.bemhtml.deps.js',
                        filesTarget : '?.bemhtml.files',
                        dirsTarget : '?.bemhtml.dirs'
                    }],
                    [bemhtml, {
                        target : '?.browser.bemhtml.js',
                        filesTarget : '?.bemhtml.files',
                        devMode : false
                    }]
                ]);

                // Template techs
                nodeConfig.addTechs([
                    [bemhtml],
                    [bh, { jsAttrName : 'data-bem', jsAttrScheme : 'json' }]
                ]);

                // Build htmls
                nodeConfig.addTechs([
                    [html],
                    [bhHtml, { target : '?.bh.html' }]
                ]);

                langs.forEach(function(lang) {
                    var destTarget = '?.' + lang + '.html';

                    nodeConfig.addTech([copyFile, { source : '?.html', target : destTarget }]);
                    nodeConfig.addTarget(destTarget);
                });

                nodeConfig.addTargets([
                    '_?.css', '_?.js', '?.html', '?.bh.html'
                ]);
            });

            config.mode('development', function() {
                config.nodes(nodes, function(nodeConfig) {
                    nodeConfig.addTechs([
                        [copyFile, { source : '?.css', target : '_?.css' }],
                        [copyFile, { source : '?.js', target : '_?.js' }]
                    ]);
                });
            });

            config.mode('production', function() {
                config.nodes(nodes, function(nodeConfig) {
                    nodeConfig.addTechs([
                        [borschik, { source : '?.css', target : '_?.css', freeze : true, tech : 'cleancss' }],
                        [borschik, { source : '?.js', target : '_?.js', freeze : true }]
                    ]);
                });
            });
        });
    }

    function configureLevels(platform, nodes) {
        config.nodes(nodes, function(nodeConfig) {
            var nodeDir = nodeConfig.getNodePath(),
                blockSublevelDir = path.join(nodeDir, '..', '.blocks'),
                sublevelDir = path.join(nodeDir, 'blocks'),
                extendedLevels = [].concat(getTestLevels(platform));

            if(fs.existsSync(blockSublevelDir)) {
                extendedLevels.push(blockSublevelDir);
            }

            if(fs.existsSync(sublevelDir)) {
                extendedLevels.push(sublevelDir);
            }

            nodeConfig.addTech([levels, { levels : extendedLevels }]);
        });
    }

    function configureSets(platforms, sets) {
        platforms.forEach(function(platform) {
            sets.examples.configure({
                destPath : platform + '.examples',
                levels : getLibLevels(platform),
                techSuffixes : ['examples'],
                fileSuffixes : ['bemjson.js', 'title.txt'],
                inlineBemjson : true,
                processInlineBemjson : wrapInPage
            });

            sets.tests.configure({
                destPath : platform + '.tests',
                levels : getLibLevels(platform),
                techSuffixes : ['tests'],
                fileSuffixes : ['bemjson.js', 'title.txt']
            });

            sets.docs.configure({
                destPath : platform + '.docs',
                levels : getLibLevels(platform),
                exampleSets : [platform + '.examples'],
                langs : config.getLanguages(),
                jsdoc : { suffixes : ['vanilla.js', 'browser.js', 'js'] }
            });

            sets.specs.configure({
                destPath : platform + '.specs',
                levels : getLibLevels(platform),
                sourceLevels : getSpecLevels(platform),
                jsSuffixes : ['vanilla.js', 'browser.js', 'js']
            });
        });
    }
};

function getLibLevels(platform) {
    return PLATFORMS[platform].map(function(level) {
        return level + '.blocks';
    });
}

function getSourceLevels(platform) {
    var platformNames = PLATFORMS[platform];
    var levels = [];

    platformNames.forEach(function(name) {
        levels.push({ path : path.join('libs', 'bem-core', name + '.blocks'), check : false });
    });

    platformNames.forEach(function(name) {
        levels.push({ path : name + '.blocks', check : true });
    });

    return levels;
}

function getTestLevels(platform) {
    return [].concat(
        getSourceLevels(platform),
        'test.blocks'
    );
}

function getSpecLevels(platform) {
    return [].concat(
        { path : path.join('libs', 'bem-pr', 'spec.blocks'), check : false },
        getSourceLevels(platform)
    );
}

function getBrowsers(platform) {
    switch(platform) {
        case 'desktop':
            return [
                'last 2 versions',
                'ie 10',
                'ff 24',
                'opera 12.16'
            ];
    }
}

function wrapInPage(bemjson, meta) {
    var basename = '_' + path.basename(meta.filename, '.bemjson.js');
    return {
        block : 'page',
        title : naming.stringify(meta.notation),
        head : [{ elem : 'css', url : basename + '.css' }],
        scripts : [{ elem : 'js', url : basename + '.js' }],
        content : bemjson
    };
}
