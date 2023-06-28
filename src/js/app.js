import onChange from 'on-change';
import { uniqueId } from 'lodash';
import i18next from 'i18next';
import axios from 'axios';
import { string, setLocale } from 'yup';
import resources from './locales/index.js';
import render from './view.js';
import parser from './parser.js';

const validateLink = (link, rssLinks) => {
  const schema = string().trim().required().url()
    .notOneOf(rssLinks);
  return schema.validate(link);
};

const addProxy = (url) => {
  const allOriginsLink = 'https://allorigins.hexlet.app/get';

  const currentUrl = new URL(allOriginsLink);

  currentUrl.searchParams.set('disableCache', 'true');
  currentUrl.searchParams.set('url', url);

  return axios.get(currentUrl);
};

const createPosts = (state, newPosts, feedId) => {
  const preparedPosts = newPosts.map((post) => ({ ...post, feedId, id: uniqueId() }));
  state.posts = [...state.posts, ...preparedPosts];
};
const timeout = 5000;
const getNewPosts = (state) => {
  const promises = state.feeds
    .map(({ link, feedId }) => addProxy(link)
      .then((response) => {
        const { posts } = parser(response.data.contents);
        const addedPosts = state.posts.map((post) => post.link);
        const newPosts = posts.filter((post) => !addedPosts.includes(post.link));
        if (newPosts.length > 0) {
          createPosts(state, newPosts, feedId);
        }
        return Promise.resolve();
      }));

  Promise.allSettled(promises)
    .finally(() => {
      setTimeout(() => getNewPosts(state), timeout);
    });
};

export default () => {
  const defaultLanguage = 'ru';

  const i18nInstance = i18next.createInstance();

  i18nInstance
    .init({
      lng: defaultLanguage,
      debug: true,
      resources,
    })
    .then(() => {
      setLocale({
        mixed: {
          notOneOf: 'doubleRss',
        },
        string: {
          url: 'invalidUrl',
        },
      });

      const elements = {
        form: document.querySelector('.rss-form'),
        input: document.querySelector('#url-input'),
        example: document.querySelector('.text-muted'),
        feedback: document.querySelector('.feedback'),
        button: document.querySelector('button[type="submit"]'),
        feeds: document.querySelector('.feeds'),
        posts: document.querySelector('.posts'),
        modal: {
          modalElement: document.querySelector('.modal'),
          title: document.querySelector('.modal-title'),
          body: document.querySelector('.modal-body'),
          showFull: document.querySelector('.full-article'),
        },
      };

      const initialState = {
        valid: true,
        loadingProcess: {
          state: 'loading', // sending, finished, error
          error: null,
        },
        feeds: [],
        posts: [],

        uiState: {
          visitedLinksIds: new Set(),
          modalId: '',
        },
      };

      const watchedState = onChange(initialState, render(elements, initialState, i18nInstance));

      getNewPosts(watchedState);

      elements.form.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(e.target);
        const inputValue = formData.get('url').trim();

        const urlsList = watchedState.feeds.map(({ link }) => link);

        validateLink(inputValue, urlsList)
          .then(() => {
            watchedState.valid = true;
            watchedState.loadingProcess.state = 'sending';

            return addProxy(inputValue);
          })
          .then((response) => {
            const data = response.data.contents;
            const { feed, posts } = parser(data);

            const feedId = uniqueId();
            watchedState.feeds.push({ ...feed, feedId, link: inputValue });
            createPosts(watchedState, posts, feedId);

            watchedState.loadingProcess.state = 'finished';
          })
          .catch((error) => {
            watchedState.valid = false;
            watchedState.loadingProcess.error = error.message ?? 'defaultError';
            watchedState.loadingProcess.state = 'error';
          });
      });

      elements.modal.modalElement.addEventListener('show.bs.modal', (e) => {
        const postId = e.relatedTarget.getAttribute('data-id');
        watchedState.uiState.visitedLinksIds.add(postId);
        watchedState.uiState.modalId = postId;
      });

      elements.input.addEventListener('click', (e) => {
        const postId = e.target.dataset.id;
        if (postId) {
          watchedState.uiState.visitedLinksIds.add(postId);
        }
      });
    });
};
