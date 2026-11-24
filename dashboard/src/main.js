import { createApp } from 'vue';
import VueApexCharts from 'vue3-apexcharts';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import '@fontsource-variable/karla';
import App from './App.vue';
import './styles.css';

createApp(App)
  .use(VueApexCharts)
  .component('font-awesome-icon', FontAwesomeIcon)
  .mount('#app');
