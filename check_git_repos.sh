#!/bin/bash

# 遍历所有找到的 git 仓库
for git_dir in /root/.phpenv/.git /root/.phpenv/plugins/php-build/.git /root/.pyenv/.git /root/.oh-my-zsh/.git /root/.nvm/.git /tmp/php-build/source/8.2snapshot/.git /tmp/php-build/source/8.3snapshot/.git /tmp/php-build/source/8.5snapshot/.git /tmp/php-build/source/8.4snapshot/.git /tmp/php-build/source/xdebug-master/.git /workspace/.git; do
    repo_dir=$(dirname "$git_dir")
    echo "=================================================="
    echo "检查仓库: $repo_dir"
    echo "=================================================="
    
    cd "$repo_dir" || continue
    
    # 显示所有分支
    echo "当前分支:"
    git branch --show-current
    echo -e "\n所有本地分支:"
    git branch
    echo -e "\n所有远程分支:"
    git branch -r
    
    echo -e "\n"
done
