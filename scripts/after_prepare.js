module.exports = function(ctx) {
  const SentryCli = require('@sentry/cli');
  const path = ctx.requireCordovaModule('path');
  const fs = ctx.requireCordovaModule('fs');
  const crypto = require('crypto');

  function checksum(str) {
    return crypto
      .createHash('sha1')
      .update(str, 'utf8')
      .digest('hex');
  }

  const buildPath = path.join(ctx.opts.paths[0], 'build');
  if (!fs.existsSync(buildPath)) {
    console.error('Sentry: build path does not exist');
    console.error('This is not an Ionic project, please check out:');
    console.error('https://docs.sentry.io/clients/javascript/sourcemaps/');
    console.error('to find out how to correctly upload sourcemaps for your project.');
    return;
  }

  const configFile = path.join(
    buildPath,
    '..',
    '..',
    ctx.opts.platforms[0] === 'android' ? '..' : '',
    'sentry.properties'
  );

  if (!fs.existsSync(configFile)) {
    console.error(
      'Sentry: sentry.properties does not exist, please run `sentry-wizard -i cordova`'
    );
    process.exit(1);
    return;
  }

  const indexHtml = path.join(buildPath, '..', 'index.html');
  if (!fs.existsSync(configFile)) {
    console.error('Sentry: index.html does not exist');
    return;
  }

  // Adding files to include
  let includes = [];
  includes.push(path.join(buildPath, 'main.js'));
  includes.push(path.join(buildPath, 'main.js.map'));
  includes.push(path.join(buildPath, 'vendor.js.map'));
  includes.push(path.join(buildPath, 'vendor.js'));
  includes.push(path.join(buildPath, 'polyfills.js'));

  const algorithm = 'sha1';
  let allHash = '';

  includes.forEach(file => {
    let shasum = crypto.createHash(algorithm);
    shasum.update(fs.readFileSync(file));
    allHash += shasum.digest('hex');
  });

  const shasum2 = crypto.createHash(algorithm);
  shasum2.update(allHash);
  const fileHash = shasum2.digest('hex');
  const release = fileHash.slice(0, 7);

  const regex = /<head>(?:[\s\S]*(<!-- sentry-cordova -->))?/g;
  let contents = fs.readFileSync(indexHtml, {
    encoding: 'utf-8',
  });
  const releaseSentry = `
  <script>
  (function(w){var i=w.sentryRelease=w.sentryRelease||{};i.id='${release}';})(window);
  </script>
  <!-- sentry-cordova -->`;
  const replaceWith = `<head>${releaseSentry}`;
  fs.writeFileSync(indexHtml, contents.replace(regex, replaceWith));

  // This is allowed to fail because it's ionic specific
  const projectRootIndexHtml = path.join(ctx.opts.projectRoot, 'src', 'index.html');
  if (fs.existsSync(projectRootIndexHtml)) {
    contents = fs.readFileSync(projectRootIndexHtml, {
      encoding: 'utf-8',
    });
    fs.writeFileSync(projectRootIndexHtml, contents.replace(regex, replaceWith));
  }

  const ignore = ['node_modules'];

  const sentryCli = new SentryCli(configFile);

  return sentryCli
    .createRelease(release)
    .then(() =>
      sentryCli.uploadSourceMaps({
        release: release,
        include: includes,
        ignore: ignore,
      })
    )
    .then(() => sentryCli.finalizeRelease(release));
};
