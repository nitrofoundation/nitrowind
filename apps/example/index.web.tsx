import { AppRegistry } from 'react-native';

import App from './App';
import { name as appName } from './app.json';
import { initializeBrowserTheme } from './platform/theme';
import './web.css';

initializeBrowserTheme();
AppRegistry.registerComponent(appName, () => App);

const rootTag = document.getElementById('root');

if (!rootTag) {
  throw new Error('Nitrowind web root was not found.');
}

AppRegistry.runApplication(appName, { rootTag });
