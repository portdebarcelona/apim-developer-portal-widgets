import {createApp} from 'vue';
import Editor from '../../shared/api-documentation/Editor.vue';
createApp(Editor, {kind: 'swagger'}).mount('#root');
