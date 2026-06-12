import styles from './Help.module.css'

export default function Help() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h1>Chats 帮助手册</h1>

        <section className={styles.section}>
          <h2>1. 功能概览</h2>
          <p>Chats 是您的对话历史管理界面，帮助您高效地组织、搜索和操作历史对话。</p>
        </section>

        <section className={styles.section}>
          <h2>2. 快速开始</h2>
          <div className={styles.item}>
            <h3>新建对话</h3>
            <p>点击右上角 <strong>New Chat</strong> 按钮，或使用快捷键 <kbd>⇧⌘O</kbd> 立即开始新对话。</p>
          </div>
          <div className={styles.item}>
            <h3>查看历史对话</h3>
            <p>在对话列表中浏览所有历史对话，默认按最近活动时间排序，收藏对话会显示在顶部。</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>3. 搜索与过滤</h2>
          <p>在搜索框中输入关键词，系统会实时过滤标题和预览内容，助您快速找到目标对话。</p>
        </section>

        <section className={styles.section}>
          <h2>4. 对话操作</h2>
          
          <div className={styles.item}>
            <h3>4.1 选择对话</h3>
            <ul>
              <li><strong>单选</strong>：点击对话左侧的复选框</li>
              <li><strong>全选</strong>：点击列表顶部的复选框，或点击 <strong>Select</strong> 按钮后选择所有</li>
              <li><strong>批量选择</strong>：配合复选框实现多选</li>
            </ul>
          </div>

          <div className={styles.item}>
            <h3>4.2 移动到项目</h3>
            <p>选择对话后，点击工具栏中的移动按钮，可将对话移动到指定项目分类中。</p>
          </div>

          <div className={styles.item}>
            <h3>4.3 归档</h3>
            <p>在对话操作菜单中选择「归档」，归档后的对话不会显示在主列表中。</p>
          </div>

          <div className={styles.item}>
            <h3>4.4 删除</h3>
            <p>为防止误操作，删除采用 <strong>2-click 确认</strong> 模式：</p>
            <ol>
              <li>第一次点击显示确认状态</li>
              <li>再次点击确认删除</li>
            </ol>
          </div>

          <div className={styles.item}>
            <h3>4.5 重命名</h3>
            <p>在操作菜单中选择「重命名」，输入新名称后确认即可。</p>
          </div>

          <div className={styles.item}>
            <h3>4.6 收藏</h3>
            <p>收藏对话会显示在列表顶部，方便快速访问。再次点击可取消收藏。</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>5. 快捷键</h2>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>快捷键</th>
                <th>功能</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><kbd>⇧⌘O</kbd></td>
                <td>新建对话</td>
              </tr>
              <tr>
                <td><kbd>⌘K</kbd></td>
                <td>打开搜索</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className={styles.section}>
          <h2>6. 主题适配</h2>
          <p>Chats 支持多种主题风格，会根据系统或应用设置自动切换：</p>
          <ul>
            <li><strong>Light</strong>：明亮清爽的主题</li>
            <li><strong>Warm</strong>：温暖柔和的主题</li>
            <li><strong>Dark</strong>：深色护眼的主题</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>7. 常见问题</h2>
          <div className={styles.item}>
            <h3>Q: 为什么找不到某些对话？</h3>
            <p>A: 可能已被归档或删除，请检查归档项目或使用搜索功能。</p>
          </div>
          <div className={styles.item}>
            <h3>Q: 如何恢复已删除的对话？</h3>
            <p>A: 目前删除操作不可恢复，请谨慎操作。</p>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <p>查看完整文档或打印为 PDF：使用浏览器打印功能 (⌘P)</p>
      </div>
    </div>
  )
}
