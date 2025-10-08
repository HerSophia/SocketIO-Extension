export type Settings = z.infer<typeof Settings>;
export const Settings = z
  .object({
<<<<<<< HEAD
    /** 是否启用 SocketIO 中转 */
    socket_enabled: z.boolean().default(false),
    /** 服务器 URL，如 http://localhost:3001 */
    server_url: z.string().default('http://localhost:3001'),
    /** 命名空间，如 /st */
    namespace: z.string().default('/st'),
    /** 鉴权 Token，可选 */
    auth_token: z.string().default(''),
    /** 是否使用流式响应（OpenAI SSE 兼容） */
    use_stream: z.boolean().default(true),
  })
  .prefault({});

export const setting_field = 'socketio_extension';
=======
    button_selected: z.boolean().default(false),
  })
  .prefault({});

export const setting_field = 'tavern_extension_example';
>>>>>>> f51dc0026eb0eedd596175bbe6a7c811a02ace75
